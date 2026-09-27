import { useQuery } from "@tanstack/react-query";
import type { Message, Part } from "@opencode-ai/sdk/v2";

import { createClient } from "@/lib/opencode-client";
import { Server } from "@/stores";

export interface MessageItem {
  info: Message;
  parts: Part[];
}

export function useSessionMessages(server: Server, sessionId: string) {
  return useQuery({
    queryKey: ["server", server.url, "session", sessionId, "messages"],
    queryFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      // Verified against :4096 — the endpoint ignores `offset` and a
      // truncated limit returns an unstable window that can miss newest
      // messages indefinitely. So the limit must cover the whole session
      // in ONE fetch (1500 covers the largest known session: 708 msgs in
      // ~1s on LAN). Order is normalized client-side in sortedMessages.
      const messagesResult = await client.session.messages({
        sessionID: sessionId,
        limit: 1500,
      });
      const all = ((messagesResult.data ?? []) as MessageItem[]).slice(0, 1500);

      return all;
    },
    refetchInterval: 3000,
  });
}
