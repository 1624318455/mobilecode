import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import { locationInput } from "@/lib/v2types";
import { Server } from "@/stores";

export function useAgents(server: Server, directory?: string) {
  return useQuery({
    queryKey: ["server", server.url, "agents"],
    queryFn: async () => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.agent.list(locationInput(directory));

      return result.data || [];
    },
    select: (agents) => {
      return agents.filter((a) => {
        if (a.mode === "subagent") {
          return false;
        }

        const hidden = ["compaction", "title", "summary"];
        if (hidden.includes(a.name)) {
          return false;
        }

        return true;
      });
    },
  });
}
