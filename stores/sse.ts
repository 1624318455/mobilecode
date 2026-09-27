import { create } from "zustand";

export type SseConnState = "connecting" | "live" | "error" | "off";

export interface SseConnInfo {
  state: SseConnState;
  lastEventAt: number | null;
  errors: number;
}

interface SseStore {
  byUrl: Record<string, SseConnInfo>;
  mark: (url: string, patch: Partial<SseConnInfo>) => void;
}

const EMPTY: SseConnInfo = { state: "off", lastEventAt: null, errors: 0 };

// Ephemeral (not persisted): proves whether the SSE transport on this
// phone actually delivers events. Heartbeats alone keep lastEventAt fresh.
export const useSseStore = create<SseStore>()((set) => ({
  byUrl: {},
  mark: (url, patch) =>
    set((s) => ({
      byUrl: {
        ...s.byUrl,
        [url]: { ...EMPTY, ...s.byUrl[url], ...patch },
      },
    })),
}));
