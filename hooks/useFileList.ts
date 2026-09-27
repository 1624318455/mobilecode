import { useQuery } from "@tanstack/react-query";
import type { FileNode } from "@opencode-ai/sdk/v2";

import { createClient } from "@/lib/opencode-client";
import { Server } from "@/stores";

// Forward slashes only: the server 500s on backslash paths (verified).
export function toServerPath(path: string): string {
  return path.replace(/\\/g, "/");
}

// Browse a directory on the server for the attach sheet.
// browsePath must be an absolute forward-slash path (start with projectPath).
export function useFileList(
  server: Server,
  projectPath: string | undefined,
  browsePath: string | undefined,
) {
  return useQuery({
    queryKey: [
      "server",
      server.url,
      "project",
      projectPath,
      "fileList",
      browsePath,
    ],
    queryFn: async (): Promise<FileNode[]> => {
      const client = createClient({
        baseUrl: server.url,
        directory: projectPath,
        username: server.username,
        password: server.password,
      });
      const result = await client.file.list({
        path: toServerPath(browsePath as string),
      });

      if (result.error) {
        throw result.error;
      }

      const nodes = (result.data ?? []) as FileNode[];

      return [...nodes].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }

        return a.name.localeCompare(b.name);
      });
    },
    enabled: !!projectPath && !!browsePath,
    staleTime: 10_000,
  });
}
