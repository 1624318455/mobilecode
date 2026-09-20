import { useQueries } from "@tanstack/react-query";
import { Session } from "@opencode-ai/sdk/v2";

import { createClient } from "@/lib/opencode-client";
import { Server } from "@/stores";

export interface RecentSession {
  serverId: string;
  serverName: string;
  projectId: string;
  projectName: string;
  projectIcon?: { color?: string; url?: string };
  sessionId: string;
  sessionTitle: string;
  updatedAt: string;
  directory: string;
  agent?: string;
  modelName?: string;
}

export interface SessionFetchInfo {
  serverId: string;
  serverName: string;
  fetched: number;
  shown: number;
  droppedNoTime: number;
  droppedArchived: number;
  error: string | null;
}

export interface DirectoryProject {
  id: string;
  name: string;
  path: string;
}

export function basenameOf(directory: string): string {
  const normalized = directory.replace(/\\/g, "/").replace(/\/+$/, "");
  const base = normalized.split("/").pop();

  return base || directory;
}

interface SessionLocation {
  location?: { directory?: string };
}

interface SessionRuntime {
  agent?: string;
  model?: { id?: string };
}

function sessionDirectory(s: Session): string {
  if (s.directory) {
    return s.directory;
  }

  const loc = (s as Session & SessionLocation).location;

  if (loc && typeof loc.directory === "string") {
    return loc.directory;
  }

  return "";
}

function normalizeSession(server: Server, s: Session): RecentSession | null {
  if (s.time?.archived) {
    return null;
  }

  const directory = sessionDirectory(s);
  const updated = s.time?.updated;

  if (!updated) {
    return null;
  }

  const runtime = s as Session & SessionRuntime;

  return {
    serverId: server.id,
    serverName: server.name,
    projectId: s.projectID || "global",
    projectName: directory ? basenameOf(directory) : "global",
    projectIcon: undefined,
    sessionId: s.id,
    sessionTitle: s.title || `Session ${s.id.slice(0, 8)}`,
    updatedAt: new Date(updated).toISOString(),
    directory,
    agent: runtime.agent || undefined,
    modelName: runtime.model?.id || undefined,
  };
}

export function directoriesQueryKey(serverUrl: string) {
  return ["server", serverUrl, "directories"] as const;
}

export function discoverDirectoryProjects(sessions: Session[]): DirectoryProject[] {
  const dirs = new Map<string, DirectoryProject>();

  for (const s of sessions) {
    const raw = sessionDirectory(s);

    if (!raw || s.time?.archived || dirs.has(raw)) {
      continue;
    }

    dirs.set(raw, {
      id: encodeURIComponent(raw),
      name: basenameOf(raw),
      path: raw,
    });
  }

  return [...dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function errorText(error: unknown): string | null {
  if (!error) {
    return null;
  }

  return error instanceof Error ? error.message : String(error);
}

// Single-phase aggregation: one global session.list per server, grouped
// client-side. No cascade, no cross-hook key sharing, no false-empty states.
// (ServerContent keeps its own per-directory queries for the detail page.)
export function useAllSessions(servers: Server[]) {
  const { recentSessions, isLoading, fetchInfo, listError } = useQueries({
    queries: servers.map((server) => ({
      queryKey: ["server", server.url, "sessions"],
      queryFn: async () => {
        const client = createClient({
          baseUrl: server.url,
          username: server.username,
          password: server.password,
        });
        const result = await client.session.list();

        if (result.error) {
          throw result.error;
        }

        return result.data || [];
      },
      retry: 2,
      select: (data: Session[]) => {
        const out: RecentSession[] = [];
        let droppedNoTime = 0;
        let droppedArchived = 0;

        for (const s of data) {
          if (s.time?.archived) {
            droppedArchived++;
            continue;
          }

          if (!s.time?.updated) {
            droppedNoTime++;
            continue;
          }

          const item = normalizeSession(server, s);

          if (item) {
            out.push(item);
          }
        }

        return {
          items: out,
          fetched: (data as unknown[]).length,
          droppedNoTime,
          droppedArchived,
        };
      },
    })),
    combine: (results) => {
      const recentSessions = results
        .flatMap((query) => query.data?.items || [])
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );

      const fetchInfo: SessionFetchInfo[] = results.map((query, index) => ({
        serverId: servers[index]?.id || "",
        serverName: servers[index]?.name || "",
        fetched: query.data?.fetched ?? 0,
        shown: query.data?.items.length ?? 0,
        droppedNoTime: query.data?.droppedNoTime ?? 0,
        droppedArchived: query.data?.droppedArchived ?? 0,
        error: errorText(query.error),
      }));

      const pending = results.some((q) => q.isLoading || q.isFetching);
      const failed = results.find((q) => q.error)?.error || null;
      const isLoading = pending;

      return { recentSessions, isLoading, fetchInfo, listError: failed };
    },
  });

  return { recentSessions, isLoading, fetchInfo, listError };
}
