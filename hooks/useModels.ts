import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/opencode-client";
import { Server } from "@/stores";

export interface ModelInfo {
  id: string;
  providerID: string;
  name: string;
}

export async function fetchProviders(server: Server) {
  const client = createClient({
    baseUrl: server.url,
    username: server.username,
    password: server.password,
  });

  return (await client.provider.list()).data;
}

export function useModels(server: Server) {
  return useQuery({
    queryKey: ["server", server.url, "providers"],
    queryFn: () => fetchProviders(server),
    select: (data) => {
      if (!data) {
        return [];
      }

      const connected = new Set(data.connected || []);

      return (data.all || [])
        .filter((p) => connected.has(p.id))
        .flatMap((p) =>
          Object.values(p.models || {})
            .filter((m) => m.id && m.name)
            .map((m) => ({
              id: m.id,
              providerID: p.id,
              name: m.name,
            })),
        );
    },
  });
}
