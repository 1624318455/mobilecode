import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import { Server } from "@/stores";

export type SessionBusyState = "idle" | "busy" | "retry";

export interface SessionRunState {
  state: SessionBusyState;
  // Present when state === "retry": provider-supplied reason + next attempt.
  message: string | null;
  next: number | null;
}

// Busy detection via the active-session map (v2 removed the per-directory
// status endpoint). Absent from the map means idle; the retry flavor no
// longer exists server-side, so message/next stay null and the UI falls
// back to its generic busy treatment.
export function useSessionStatus(
  server: Server,
  sessionId: string,
  directory?: string,
) {
  return useQuery({
    queryKey: ["server", server.url, "session", sessionId, "status"],
    queryFn: async (): Promise<SessionRunState> => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const active = await client.session.active();

      if (active[sessionId]) {
        return { state: "busy", message: null, next: null };
      }

      return { state: "idle", message: null, next: null };
    },
    refetchInterval: 5000,
    staleTime: 3000,
    gcTime: 5 * 60 * 1000,
  });
}
