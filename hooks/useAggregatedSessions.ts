import { useQuery } from "@tanstack/react-query";

import { fetchAggregatedSessions } from "@/lib/sessionAggregate";
import type { AggregateResult } from "@/lib/sessionAggregate";
import { Server } from "@/stores";

export function aggregateQueryKey(serverUrl: string) {
  return ["server", serverUrl, "aggregate"] as const;
}

export function useAggregatedSessions(server: Server) {
  return useQuery({
    queryKey: aggregateQueryKey(server.url),
    queryFn: async (): Promise<AggregateResult> => {
      return fetchAggregatedSessions(server);
    },
    retry: 2,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
