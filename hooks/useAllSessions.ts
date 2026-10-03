import { useQueries } from "@tanstack/react-query";
import type { SessionInfo as Session } from "@opencode/client";

import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { fetchAggregatedSessions } from "@/lib/sessionAggregate";
import { normalizeDirectory } from "@/lib/sessionAggregate";
import type { AggregateResult } from "@/lib/sessionAggregate";
import { sessionDirectoryOf } from "@/lib/v2types";
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
  droppedNoDirectory: number;
  dirsQueried: number;
  dirsFailed: number;
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

interface SessionRuntime {
  agent?: string;
  model?: { id?: string };
}

interface SessionTime {
  updated?: number;
  created?: number;
  archived?: boolean;
}

export function sessionDirectory(s: Session): string {
  return sessionDirectoryOf(s);
}

function normalizeSession(server: Server, s: Session): RecentSession | null {
  if (s.time?.archived) {
    return null;
  }

  const directory = sessionDirectory(s);
  const time = s.time as SessionTime | undefined;
  const updated = time?.updated ?? time?.created;

  if (!updated) {
    return null;
  }

  const runtime = s as Session & SessionRuntime;

  return {
    serverId: server.id,
    serverName: server.name,
    projectId: s.projectID || (directory ? encodeURIComponent(directory) : "global"),
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
  return aggregateQueryKey(serverUrl);
}

export function discoverDirectoryProjects(sessions: Session[]): DirectoryProject[] {
  const dirs = new Map<string, DirectoryProject>();

  for (const s of sessions) {
    const raw = sessionDirectory(s);

    if (!raw || s.time?.archived) {
      continue;
    }

    // Group spellings of the same folder ("D:\proj" vs "D:/proj/") so a
    // mobile-created session never ghost-splits into a project the
    // desktop groups differently. Keep the first raw spelling for server
    // calls so no new variant is introduced.
    const key = normalizeDirectory(raw);

    if (dirs.has(key)) {
      continue;
    }

    dirs.set(key, {
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

// Two-phase aggregation per server: project.list worktrees fan-out plus a
// global session.list, deduped by session id. Shared ["server", url,
// "aggregate"] cache with useServerDirectories: one fetch per server.
export function useAllSessions(servers: Server[]) {
  const { recentSessions, isLoading, fetchInfo, listError } = useQueries({
    queries: servers.map((server) => ({
      queryKey: aggregateQueryKey(server.url),
      queryFn: async (): Promise<AggregateResult> => {
        return fetchAggregatedSessions(server);
      },
      retry: 2,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      select: (result: AggregateResult) => {
        const out: RecentSession[] = [];
        let droppedNoTime = 0;
        let droppedArchived = 0;
        let droppedNoDirectory = 0;

        for (const s of result.sessions) {
          if (s.time?.archived) {
            droppedArchived++;
            continue;
          }

          const time = s.time as SessionTime | undefined;

          if (!time?.updated && !time?.created) {
            droppedNoTime++;
            continue;
          }

          const item = normalizeSession(server, s);

          if (item) {
            if (!item.directory) {
              droppedNoDirectory++;
            }

            out.push(item);
          }
        }

        return {
          items: out,
          fetched: result.sessions.length,
          droppedNoTime,
          droppedArchived,
          droppedNoDirectory,
          dirsQueried: result.dirsQueried,
          dirsFailed: result.dirsFailed.length,
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
        droppedNoDirectory: query.data?.droppedNoDirectory ?? 0,
        dirsQueried: query.data?.dirsQueried ?? 0,
        dirsFailed: query.data?.dirsFailed ?? 0,
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
