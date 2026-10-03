import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import { Server } from "@/stores";

export function useSessionForms(server: Server, sessionId: string) {
  return useQuery({
    queryKey: ["server", server.url, "session", sessionId, "forms"],
    queryFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });

      return client.session.form.list({ sessionID: sessionId });
    },
    refetchInterval: 1500,
  });
}
