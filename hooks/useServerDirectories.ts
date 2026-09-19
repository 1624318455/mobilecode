import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/opencode-client";
import { basenameOf } from "@/hooks/useAllSessions";
import { Server } from "@/stores";

export interface DirectoryProject {
  id: string;
  name: string;
  path: string;
}

export function useServerDirectories(server: Server) {
  return useQuery({
    queryKey: ["server", server.url, "directories"],
    queryFn: async () => {
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.session.list();

      if (result.error) {
        throw result.error;
      }

      const dirs = new Map<string, DirectoryProject>();

      for (const s of result.data || []) {
        const raw = s.directory as string | undefined;

        if (!raw || s.time?.archived) {
          continue;
        }

        if (!dirs.has(raw)) {
          dirs.set(raw, {
            id: encodeURIComponent(raw),
            name: basenameOf(raw),
            path: raw,
          });
        }
      }

      return [...dirs.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
  });
}
