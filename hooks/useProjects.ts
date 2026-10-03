import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import { Server } from "@/stores";

export function useProjects(server: Server) {
  return useQuery({
    queryKey: ["server", server.url, "projects"],
    queryFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.project.list();
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
