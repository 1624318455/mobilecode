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
  error: string | null;
}

export interface DirectoryProject {
  id: string;
  name: string;
  path: string;
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

export function directoriesQueryKey(serverUrl: string) {
  return ["server", serverUrl, "directories"] as const;
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

// Two-phase aggregation that reads from the SAME per-directory endpoint the
// device page uses, so Recents, counts, and ServerContent always agree:
//  1. one global session.list per server to discover directories,
//  2. one session.list({ directory }) per directory for the real rows.
export function useAllSessions(servers: Server[]) {
  const directories = useQueries({
    queries: servers.map((server) => ({
      queryKey: directoriesQueryKey(server.url),
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

        return discoverDirectoryProjects(result.data || []);
      },
    })),
    combine: (results) => {
      return results.flatMap((query, index) => {
        if (!query.data) {
          return [];
        }

        return query.data.map((project) => ({
          server: servers[index],
          project,
        }));
      });
    },
  });

  const { recentSessions, isLoading, fetchInfo } = useQueries({
    queries: directories.map(({ server, project }) => ({
      queryKey: ["server", server.url, "project", project.path, "sessions"],
      queryFn: async () => {
        const client = createClient({
          baseUrl: server.url,
          directory: project.path,
          username: server.username,
          password: server.password,
        });
        const result = await client.session.list({
          directory: project.path,
        });

        if (result.error) {
          throw result.error;
        }

        return result.data || [];
      },
      select: (data: Session[]) => {
        const out: RecentSession[] = [];

        for (const s of data) {
          const item = normalizeSession(server, s);

          if (item) {
            out.push(item);
          }
        }

        return { items: out, fetched: (data as unknown[]).length };
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
        serverId: directories[index]?.server.id || "",
        serverName: directories[index]?.server.name || "",
        fetched: query.data?.fetched ?? 0,
        shown: query.data?.items.length ?? 0,        error: query.error
          ? query.error instanceof Error
            ? query.error.message
            : String(query.error)
          : null,
      }));

      const isLoading = results.some((q) => q.isLoading);

      return { recentSessions, isLoading, fetchInfo };
    },
  });

  return { recentSessions, isLoading, fetchInfo };
}
