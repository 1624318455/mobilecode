import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { zustandStorage } from "@/lib/mmkv";

const STORE_NAME = "mobilecode-diag-log";
const MAX_ENTRIES = 120;

export type DiagLevel = "info" | "success" | "warn" | "error";

export interface DiagEntry {
  id: number;
  at: number;
  server: string;
  level: DiagLevel;
  msg: string;
  count: number;
}

interface DiagLogState {
  entries: DiagEntry[];
  log: (server: string, level: DiagLevel, msg: string) => void;
  clear: () => void;
}

let nextId = 1;

function sanitize(raw: unknown): DiagEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: DiagEntry[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const e = item as Record<string, unknown>;

    if (
      typeof e.id !== "number" ||
      typeof e.at !== "number" ||
      typeof e.server !== "string" ||
      typeof e.msg !== "string"
    ) {
      continue;
    }

    const level: DiagLevel =
      e.level === "success" || e.level === "warn" || e.level === "error"
        ? e.level
        : "info";

    out.push({
      id: e.id,
      at: e.at,
      server: e.server,
      level,
      msg: e.msg,
      count: typeof e.count === "number" && e.count > 0 ? e.count : 1,
    });

    if (out.length >= MAX_ENTRIES) {
      break;
    }
  }

  return out;
}

// Resident diagnostics log: gateway checks, watcher transitions and errors,
// WS blocks. Consecutive duplicates fold into a count so hot loops (poll,
// resubscribe) never flood the list. Persisted so it survives restarts.
export const useDiagLogStore = create<DiagLogState>()(
  persist(
    (set) => ({
      entries: [],
      log: (server, level, msg) =>
        set((state) => {
          const [head, ...rest] = state.entries;

          if (head && head.server === server && head.level === level && head.msg === msg) {
            return {
              entries: [
                { ...head, at: Date.now(), count: head.count + 1 },
                ...rest,
              ],
            };
          }

          const entry: DiagEntry = {
            id: nextId++,
            at: Date.now(),
            server,
            level,
            msg,
            count: 1,
          };

          return { entries: [entry, ...state.entries].slice(0, MAX_ENTRIES) };
        }),
      clear: () => {
        set({ entries: [] });
        zustandStorage.removeItem(STORE_NAME);
      },
    }),
    {
      name: STORE_NAME,
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ entries: state.entries }),
      migrate: (persisted) => {
        try {
          const state = (persisted || {}) as { entries?: unknown };

          return { entries: sanitize(state.entries) };
        } catch {
          return { entries: [] as DiagEntry[] };
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
