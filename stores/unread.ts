import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { zustandStorage } from "@/lib/mmkv";

const STORE_NAME = "mobilecode-unread";
const STORE_VERSION = 1;

export function unreadKey(serverId: string, sessionId: string): string {
  return `${serverId}:${sessionId}`;
}

export interface UnreadEntry {
  serverId: string;
  sessionId: string;
  projectId: string;
  title: string;
  serverName: string;
  updatedAt: string;
}

interface UnreadState {
  items: Record<string, UnreadEntry>;
  seenAt: Record<string, number>;
  dotEnabled: boolean;
  notifyEnabled: boolean;
  markUnread: (entry: UnreadEntry) => void;
  markSeen: (serverId: string, sessionId: string) => void;
  clearForServer: (serverId: string) => void;
  clearAll: () => void;
  setDotEnabled: (value: boolean) => void;
  setNotifyEnabled: (value: boolean) => void;
}

// Foreground red dots + background notification backlog. Keyed by
// server+session so every session across every computer is tracked.
// Persisted: a reply that finished while the app was closed is still
// unread when the user comes back.
export const useUnreadStore = create<UnreadState>()(
  persist(
    (set) => ({
      items: {},
      seenAt: {},
      dotEnabled: true,
      notifyEnabled: true,
      markUnread: (entry) => {
        set((state) => ({
          items: {
            ...state.items,
            [unreadKey(entry.serverId, entry.sessionId)]: entry,
          },
        }));
      },
      markSeen: (serverId, sessionId) => {
        set((state) => {
          const key = unreadKey(serverId, sessionId);
          const next = { ...state.items };
          delete next[key];

          return { items: next, seenAt: { ...state.seenAt, [key]: Date.now() } };
        });
      },
      clearForServer: (serverId) => {
        set((state) => ({
          items: Object.fromEntries(
            Object.entries(state.items).filter(
              ([, entry]) => entry.serverId !== serverId,
            ),
          ),
          seenAt: Object.fromEntries(
            Object.entries(state.seenAt).filter(
              ([key]) => !key.startsWith(`${serverId}:`),
            ),
          ),
        }));
      },
      clearAll: () => {
        set({ items: {}, seenAt: {} });
      },
      setDotEnabled: (value) => {
        set({ dotEnabled: value });
      },
      setNotifyEnabled: (value) => {
        set({ notifyEnabled: value });
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        items: state.items,
        dotEnabled: state.dotEnabled,
        notifyEnabled: state.notifyEnabled,
      }),
    },
  ),
);
