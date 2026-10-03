import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { zustandStorage } from "@/lib/mmkv";

const STORE_NAME = "mobilecode-ws-rules";

interface WsRuleState {
  allowedPaths: string[];
  allowPath: (path: string) => void;
  removePath: (path: string) => void;
  clearRules: () => void;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();

  if (!trimmed.startsWith("/")) {
    throw new Error("WS path must start with /");
  }

  if (trimmed.includes("?") || trimmed.includes("*")) {
    throw new Error("Query strings and wildcards are not allowed");
  }

  return trimmed;
}

export const useWsRules = create<WsRuleState>()(
  persist(
    (set) => ({
      allowedPaths: [],
      allowPath: (path) =>
        set((state) => {
          const normalized = normalizePath(path);

          if (state.allowedPaths.includes(normalized)) {
            return state;
          }

          return { allowedPaths: [...state.allowedPaths, normalized] };
        }),
      removePath: (path) =>
        set((state) => ({
          allowedPaths: state.allowedPaths.filter((p) => p !== path),
        })),
      clearRules: () => {
        set({ allowedPaths: [] });
        zustandStorage.removeItem(STORE_NAME);
      },
    }),
    {
      name: STORE_NAME,
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ allowedPaths: state.allowedPaths }),
      migrate: (persisted) => {
        try {
          const state = (persisted || {}) as { allowedPaths?: unknown };
          const paths = Array.isArray(state.allowedPaths)
            ? state.allowedPaths.filter(
                (p): p is string => typeof p === "string",
              )
            : [];

          return { allowedPaths: paths };
        } catch {
          return { allowedPaths: [] as string[] };
        }
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          zustandStorage.removeItem(STORE_NAME);
        }
      },
    },
  ),
);
