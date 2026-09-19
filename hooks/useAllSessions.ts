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
}

export function basenameOf(directory: string): string {
  const normalized = directory.replace(/\\/g, "/").replace(/\/+$/, "");
  const base = normalized.split("/").pop();

  return base || directory;
}

interface SessionLocation {
  location?: { directory?: string };
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
  };
}

export function useAllSessions(servers: Server[]) {
  const { recentSessions, isLoading } = useQueries({
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
      select: (data: Session[]) => {
        const out: RecentSession[] = [];

        for (const s of data) {
          const item = normalizeSession(server, s);

          if (item) {
            out.push(item);
          }
        }

        return out;
      },
    })),
    combine: (results) => {
      const recentSessions = results
        .flatMap((query) => query.data || [])
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );

      const isLoading = results.some((q) => q.isLoading);

      return { recentSessions, isLoading };
    },
  });

  return { recentSessions, isLoading };
}
