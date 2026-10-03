import { useQuery } from "@tanstack/react-query";

import { createV2Client } from "@/lib/v2client";
import { locationInput } from "@/lib/v2types";
import { Server } from "@/stores";

export interface ModelInfo {
  id: string;
  providerID: string;
  name: string;
  limitContext?: number;
}

export interface ContextUsage {
  used: number;
  input: number;
  output: number;
  cached: number;
  limit: number | null;
  percent: number | null;
  modelName: string;
}

export async function fetchProviders(server: Server): Promise<ModelInfo[]> {
  const client = createV2Client({
    baseUrl: server.url,
    username: server.username,
    password: server.password,
  });
  const result = await client.model.list(locationInput());

  return result.data
    .filter((m) => m.enabled)
    .map((m) => ({
      id: m.modelID,
      providerID: m.providerID,
      name: m.name,
      limitContext: m.limit?.context,
    }));
}

export function useModels(server: Server, directory?: string) {
  return useQuery({
    queryKey: ["server", server.url, "providers"],
    queryFn: async (): Promise<ModelInfo[]> => {
      const client = createV2Client({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const result = await client.model.list(locationInput(directory));

      return result.data
        .filter((m) => m.enabled)
        .map((m) => ({
          id: m.modelID,
          providerID: m.providerID,
          name: m.name,
          limitContext: m.limit?.context,
        }));
    },
  });
}
