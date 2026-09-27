import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/opencode-client";
import { Server } from "@/stores";

export type SessionBusyState = "idle" | "busy" | "retry";

export interface SessionRunState {
  state: SessionBusyState;
  // Present when state === "retry": provider-supplied reason + next attempt.
  message: string | null;
  next: number | null;
}

// Scoped session status (the endpoint only reports sessions under the
// given directory — an unscoped call reads empty). Polled while a session
// is open so a busy/retrying session surfaces instead of silently
// swallowing sends.
export function useSessionStatus(
  server: Server,
  sessionId: string,
  directory?: string,
) {
  return useQuery({
    queryKey: ["server", server.url, "session", sessionId, "status"],
    queryFn: async (): Promise<SessionRunState> => {
      const client = createClient({
        baseUrl: server.url,
        directory,
        username: server.username,
        password: server.password,
      });
      const result = await client.session.status({ directory });

      if (result.error) {
        throw result.error;
      }

      const entry = (result.data ?? {})[sessionId];

      if (!entry) {
        return { state: "idle", message: null, next: null };
      }

      if (entry.type === "busy") {
        return { state: "busy", message: null, next: null };
      }

      if (entry.type === "retry") {
        return {
          state: "retry",
          message: entry.message ?? null,
          next: entry.next ?? null,
        };
      }

      return { state: "idle", message: null, next: null };
    },
    refetchInterval: 5000,
    staleTime: 3000,
    gcTime: 5 * 60 * 1000,
  });
}
