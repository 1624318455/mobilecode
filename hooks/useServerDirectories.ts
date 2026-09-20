import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/opencode-client";
import { directoriesQueryKey, discoverDirectoryProjects } from "@/hooks/useAllSessions";
import { Server } from "@/stores";

// Shares the ["server", url, "directories"] cache entry with useAllSessions
// phase 1 on purpose: same key, same DirectoryProject[] shape, one fetch.
export function useServerDirectories(server: Server) {
  return useQuery({
    queryKey: directoriesQueryKey(server.url),
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

      return discoverDirectoryProjects(result.data || []);
    },
  });
}
