import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import { Server } from "@/stores";

export function useFileSearch(
  server: Server,
  projectPath: string | undefined,
  query: string,
) {
  return useQuery({
    queryKey: [
      "server",
      server.url,
      "project",
      projectPath,
      "fileSearch",
      query,
    ],
    queryFn: async (): Promise<string[]> => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.file.find({
        query,
        location: projectPath ? { directory: projectPath } : undefined,
      });

      return result.data.map((entry) =>
        entry.type === "directory" ? `${entry.path}/` : entry.path,
      );
    },
    enabled: !!projectPath,
    staleTime: 10_000,
  });
}
