import { useQuery, useQueryClient } from "@tanstack/react-query";

import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { sessionDirectory } from "@/hooks/useAllSessions";
import { createClient } from "@/lib/opencode-client";
import type { AggregateResult } from "@/lib/sessionAggregate";
import { isPrimarySession } from "@/lib/sessionAggregate";
import { normalizeDirectory } from "@/lib/sessionAggregate";
import { Server } from "@/stores";

export function useSessions(server: Server, projectPath?: string, enabled = true) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["server", server.url, "project", projectPath, "sessions"],
    enabled,
    // The aggregate cache (same server) usually already holds this
    // directory's sessions, so expanding shows content instantly with no
    // loading flash; the network refetch then updates silently.
    placeholderData: enabled
      ? () => {
          const agg = queryClient.getQueryData<AggregateResult>(
            aggregateQueryKey(server.url),
          );

          if (!agg || !projectPath) {
            return undefined;
          }

          const want = normalizeDirectory(projectPath);

          return agg.sessions.filter(
            (s) => {
              const raw = sessionDirectory(s);

              return raw && normalizeDirectory(raw) === want;
            },
          );
        }
      : undefined,
    queryFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        directory: projectPath,
        username: server.username,
        password: server.password,
      });
      const result = await client.session.list({
        directory: projectPath,
      });

      return result.data || [];
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    select: (data) => {
      return data
        .filter((s) => isPrimarySession(s))
        .sort((a, b) => b.time.updated - a.time.updated)
        .map((s) => {
          const runtime = s as typeof s & {
            agent?: string;
            model?: { id?: string };
          };

          return {
            id: s.id,
            title: s.title || `Session ${s.id.slice(0, 8)}`,
            updatedAt: new Date(s.time.updated).toISOString(),
            projectID: s.projectID,
            directory: s.directory,
            agent: runtime.agent || undefined,
            modelName: runtime.model?.id || undefined,
          };
        });
    },
  });
}
