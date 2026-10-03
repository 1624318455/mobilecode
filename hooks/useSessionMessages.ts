import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import type { ChatItem } from "@/lib/v2messages";
import { normalizeV2Messages } from "@/lib/v2messages";
import { Server } from "@/stores";

export type MessageItem = ChatItem;

const PAGE_LIMIT = 200;
const MAX_PAGES = 8;

export function useSessionMessages(server: Server, sessionId: string) {
  return useQuery({
    queryKey: ["server", server.url, "session", sessionId, "messages"],
    queryFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      // v2 pages at most 200 per fetch with an opaque cursor (the v1
      // endpoint ignored offsets, so one huge limit was the only option).
      // Walk newest-first pages until the cursor runs out.
      const all: ChatItem[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < MAX_PAGES; page++) {
        // The server rejects `order` combined with `cursor`: order only the
        // first page, follow-ups page purely by cursor (limit+cursor is fine).
        const res =
          cursor === undefined
            ? await client.message.list({
                sessionID: sessionId,
                limit: PAGE_LIMIT,
                order: "asc",
              })
            : await client.message.list({
                sessionID: sessionId,
                limit: PAGE_LIMIT,
                cursor,
              });

        all.push(...normalizeV2Messages(res.data));

        const next = res.cursor.next;

        if (!next) {
          break;
        }

        cursor = next;
      }

      return all.slice(0, PAGE_LIMIT * MAX_PAGES);
    },
    refetchInterval: 3000,
  });
}
