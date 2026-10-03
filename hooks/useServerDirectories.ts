import { useQuery } from "@tanstack/react-query";

import { aggregateQueryKey } from "@/hooks/useAggregatedSessions";
import { discoverDirectoryProjects } from "@/hooks/useAllSessions";
import { fetchAggregatedSessions } from "@/lib/sessionAggregate";
import { Server } from "@/stores";

// Shares the ["server", url, "aggregate"] cache entry with useAllSessions
// on purpose: same key, one fan-out fetch per server, local selects differ.
export function useServerDirectories(server: Server) {
  return useQuery({
    queryKey: aggregateQueryKey(server.url),
    queryFn: async () => {
      return fetchAggregatedSessions(server);
    },
    retry: 2,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    select: (result) => discoverDirectoryProjects(result.sessions),
  });
}
