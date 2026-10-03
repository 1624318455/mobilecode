import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import { Server } from "@/stores";

// Forward slashes only: the server 500s on backslash paths (verified).
export function toServerPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export interface BrowseNode {
  absolute: string;
  name: string;
  type: "file" | "directory";
}

// Browse a directory on the server for the attach sheet.
// browsePath must be an absolute forward-slash path (start with projectPath).
// v2 entries carry paths relative to the location, so re-anchor them here.
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
    queryFn: async (): Promise<BrowseNode[]> => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.file.list({
        location: projectPath ? { directory: projectPath } : undefined,
        path: toServerPath(browsePath as string),
      });
      const root = toServerPath(result.location.directory);
      const nodes = (result.data ?? []).map((entry): BrowseNode => {
        const absolute = `${root.replace(/\/+$/, "")}/${entry.path.replace(/^\/+/, "")}`;
        const name = entry.path.split("/").pop() || entry.path;

        return { absolute, name, type: entry.type };
      });

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
