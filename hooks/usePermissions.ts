import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import { Server } from "@/stores";

export function usePermissions(
  server: Server,
  sessionId: string,
  directory?: string,
) {
  return useQuery({
    queryKey: ["server", server.url, "session", sessionId, "permissions"],
    queryFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.permission.list({ sessionID: sessionId });
    },
    refetchInterval: 1500,
  });
}
