import type { Project, SessionInfo } from "@opencode/client";

import { createV2Client } from "@/lib/v2client";
import { projectWorktree } from "@/lib/v2types";
import type { Server } from "@/stores";

export type Session = SessionInfo;

export interface DirFailure {
  directory: string;
  message: string;
}

export interface AggregateResult {
  projects: Project[];
  sessions: Session[];
  globalFetched: number;
  perDirFetched: number;
  dirsQueried: number;
  dirsFailed: DirFailure[];
}

function sessionUpdatedAt(s: Session): number {
  const t = s.time as { updated?: number; created?: number } | undefined;

  return t?.updated ?? t?.created ?? 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }

  return out;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

// Two-phase aggregation (A strategy): project.list gives the worktree set,
// then each directory is queried explicitly. A global session.list covers
// directories the project index does not know about. Results are deduped
// by session id, keeping the newest copy.
export async function fetchAggregatedSessions(
  server: Server,
): Promise<AggregateResult> {
  const client = createV2Client({
    baseUrl: server.url,
    username: server.username,
    password: server.password,
  });

  const [projects, globalSessions] = await Promise.all([
    client.project.list(),
    client.session.list({ limit: 200 }).then((res) => res.data),
  ]);

  const byId = new Map<string, Session>();

  for (const s of globalSessions) {
    byId.set(s.id, s);
  }

  const dirsFailed: DirFailure[] = [];
  let perDirFetched = 0;
  let dirsQueried = 0;

  // Dedupe by normalized key ("D:\proj" vs "D:/proj/" is one folder),
  // keeping the first raw spelling for server calls (see normalizeDirectory).
  const seenDirs = new Set<string>();
  const directories: string[] = [];

  for (const p of projects) {
    const worktree = projectWorktree(p);

    if (!worktree) {
      continue;
    }

    const key = normalizeDirectory(worktree);

    if (!seenDirs.has(key)) {
      seenDirs.add(key);
      directories.push(worktree);
    }
  }

  for (const batch of chunk(directories, 5)) {
    const settled = await Promise.allSettled(
      batch.map(async (directory) => {
        const dirClient = createV2Client({
          baseUrl: server.url,
          username: server.username,
          password: server.password,
        });
        const result = await dirClient.session.list({ directory, limit: 200 });

        return { directory, sessions: result.data ?? [] };
      }),
    );

    for (let i = 0; i < settled.length; i++) {
      const directory = batch[i] as string;
      const entry = settled[i] as PromiseSettledResult<{
        directory: string;
        sessions: Session[];
      }>;

      if (!entry) {
        continue;
      }

      dirsQueried++;

      if (entry.status === "fulfilled") {
        perDirFetched += entry.value.sessions.length;

        for (const s of entry.value.sessions) {
          const prev = byId.get(s.id);

          if (!prev || sessionUpdatedAt(s) >= sessionUpdatedAt(prev)) {
            byId.set(s.id, s);
          }
        }
      } else {
        dirsFailed.push({ directory, message: errorMessage(entry.reason) });
      }
    }
  }

  return {
    projects,
    sessions: [...byId.values()],
    globalFetched: globalSessions.length,
    perDirFetched,
    dirsQueried,
    dirsFailed,
  };
}

// Shared predicate: primary (non-fork) sessions for per-project lists.
export function isPrimarySession(s: Session): boolean {
  return !s.parentID && !s.time.archived;
}

// Canonical grouping key for directories. The server does NOT normalize
// (forward vs back slashes, trailing slashes, 8.3 short names all store
// verbatim), so the same physical folder can arrive as "D:\proj" in one
// session and "D:/proj/" in another. Grouping/display/comparison must use
// this key, while server CALLS keep the raw string of the group so no new
// spelling variant is ever introduced (which would ghost-split the
// project and make mobile-created sessions unfindable on desktop).
export function normalizeDirectory(dir: string): string {
  const slashed = dir.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const trimmed =
    slashed.length > 1 && slashed.endsWith("/") ? slashed.slice(0, -1) : slashed;

  if (/^[A-Za-z]:$/.test(trimmed)) {
    return `${trimmed}/`;
  }

  return trimmed;
}

// Resolve a real directory for a project route id. Route ids may be the
// real project.id, the legacy encodeURIComponent(path) synthesis, or
// "global". Falls back to the session's own directory.
export function resolveProjectPath(
  projectId: string,
  projects: Project[],
  fallbackDirectory?: string,
): string | undefined {
  const direct = projects.find((p) => p.id === projectId);

  if (direct) {
    return projectWorktree(direct);
  }

  try {
    const decoded = decodeURIComponent(projectId);

    if (decoded && decoded !== projectId) {
      const want = normalizeDirectory(decoded);
      const byPath = projects.find(
        (p) => normalizeDirectory(projectWorktree(p)) === want,
      );

      if (byPath) {
        return projectWorktree(byPath);
      }

      return decoded;
    }
  } catch {
    // Not an encoded path; fall through to the session fallback.
  }

  return fallbackDirectory;
}
