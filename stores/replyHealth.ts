import { create } from "zustand";

export type WatcherState = "connecting" | "live" | "error" | "off";

export interface ReplyHealth {
  state: WatcherState;
  dirs: number;
  lastEventAt: number | null;
  busy: number;
  errors: number;
  lastNotifyAt: number | null;
  lastNotifyError: string | null;
  lastDoneAt: number | null;
  lastDoneState: string | null;
  lastPollAt: number | null;
  lastBgAt: number | null;
  lastFgAt: number | null;
  pollCount: number;
  lastSpeakAt: number | null;
  lastSpeakSid: string | null;
  lastSpeakMsg: string | null;
  lastSpeakWhy: string | null;
}

interface ReplyHealthStore {
  byUrl: Record<string, ReplyHealth>;
  mark: (url: string, patch: Partial<ReplyHealth>) => void;
}

const EMPTY: ReplyHealth = {
  state: "off",
  dirs: 0,
  lastEventAt: null,
  busy: 0,
  errors: 0,
  lastNotifyAt: null,
  lastNotifyError: null,
  lastDoneAt: null,
  lastDoneState: null,
  lastPollAt: null,
  lastBgAt: null,
  lastFgAt: null,
  pollCount: 0,
  lastSpeakAt: null,
  lastSpeakSid: null,
  lastSpeakMsg: null,
  lastSpeakWhy: null,
};

// Ephemeral (not persisted): proves whether the global reply watcher on
// this phone actually hears session events. Read by Diagnostics.
export const useReplyHealthStore = create<ReplyHealthStore>()((set) => ({
  byUrl: {},
  mark: (url, patch) =>
    set((s) => ({
      byUrl: {
        ...s.byUrl,
        [url]: { ...EMPTY, ...s.byUrl[url], ...patch },
      },
    })),
}));
