import { randomUUID } from "expo-crypto";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { zustandStorage } from "@/lib/mmkv";
import { clearSecureForServer } from "@/lib/secure";
import { useWsRules } from "@/stores/diagnostics";
import { useUnreadStore } from "@/stores/unread";

const STORE_NAME = "mobilecode-store";
const STORE_VERSION = 2;

export type ConnectionMode = "direct" | "lan" | "remote";
export type RemoteProvider =
  | "cloudflared-quick"
  | "cloudflared-named"
  | "self-proxy";

export interface Server {
  id: string;
  name: string;
  url: string;
  connectionMode: ConnectionMode | "direct" | "relay";
  provider?: RemoteProvider;
  instanceId?: string;
  username?: string;
  password?: string;
  publicKey?: string;
  secretKey?: string;
  deviceTokenRef?: string;
  caFingerprint?: string;
  needsRepair?: boolean;
  lastConnectedAt?: string;
}

export type StartupBehavior = "last" | "list";
export type LocalePref = "system" | "en" | "zh" | "ja";

function sanitizeLocalePref(raw: unknown): LocalePref {
  if (raw === "en" || raw === "zh" || raw === "ja" || raw === "system") {
    return raw;
  }

  return "system";
}

interface PersistedState {
  servers: Server[];
}

function sanitizeServer(raw: unknown): Server | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const s = raw as Record<string, unknown>;

  if (typeof s.url !== "string" || typeof s.name !== "string") {
    return null;
  }

  const mode = s.connectionMode;
  const connectionMode: Server["connectionMode"] =
    mode === "lan" || mode === "remote" || mode === "direct" || mode === "relay"
      ? mode
      : "direct";

  return {
    id: typeof s.id === "string" ? s.id : randomUUID(),
    name: s.name,
    url: s.url,
    connectionMode,
    provider:
      s.provider === "cloudflared-quick" ||
      s.provider === "cloudflared-named" ||
      s.provider === "self-proxy"
        ? s.provider
        : undefined,
    instanceId: typeof s.instanceId === "string" ? s.instanceId : undefined,
    username: typeof s.username === "string" ? s.username : undefined,
    password: typeof s.password === "string" ? s.password : undefined,
    publicKey: typeof s.publicKey === "string" ? s.publicKey : undefined,
    secretKey: typeof s.secretKey === "string" ? s.secretKey : undefined,
    deviceTokenRef:
      typeof s.deviceTokenRef === "string" ? s.deviceTokenRef : undefined,
    caFingerprint:
      typeof s.caFingerprint === "string" ? s.caFingerprint : undefined,
    needsRepair:
      typeof s.needsRepair === "boolean"
        ? s.needsRepair
        : s.url.startsWith("http://"),
    lastConnectedAt:
      typeof s.lastConnectedAt === "string" ? s.lastConnectedAt : undefined,
  };
}

function migrateServers(raw: unknown): Server[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: Server[] = [];

  for (const item of raw) {
    const clean = sanitizeServer(item);

    if (clean) {
      out.push(clean);
    }
  }

  return out;
}

interface AppState {
  // Servers (persisted)
  servers: Server[];
  addServer: (server: Omit<Server, "id">) => void;
  updateServer: (id: string, updates: Partial<Server>) => void;
  removeServer: (id: string) => void;

  // Startup (persisted)
  startupBehavior: StartupBehavior;
  setStartupBehavior: (behavior: StartupBehavior) => void;
  lastServerId: string | null;
  setLastServerId: (id: string | null) => void;

  // Locale (persisted)
  localePref: LocalePref;
  setLocalePref: (pref: LocalePref) => void;

  // Auto read-aloud for chat replies (persisted)
  autoRead: boolean;
  setAutoRead: (value: boolean) => void;

  // Last seen LAN IP for instant reconnect (persisted)
  lastSeenIp: string | null;
  setLastSeenIp: (ip: string | null) => void;

  // Clear all data
  clearAllData: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Servers
      servers: [],
      addServer: (server) =>
        set((state) => ({
          servers: [...state.servers, { ...server, id: randomUUID() }],
        })),
      updateServer: (id, updates) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, ...updates } : s,
          ),
        })),
      removeServer: (id) => {
        useUnreadStore.getState().clearForServer(id);
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
          lastServerId:
            state.lastServerId === id ? null : state.lastServerId,
        }));
      },

      // Startup
      startupBehavior: "list",
      setStartupBehavior: (behavior) =>
        set({
          startupBehavior: behavior,
        }),
      lastServerId: null,
      setLastServerId: (id) =>
        set({
          lastServerId: id,
        }),

      // Locale
      localePref: "system",
      setLocalePref: (pref) =>
        set({
          localePref: pref,
        }),

      // Auto read-aloud
      autoRead: false,
      setAutoRead: (value) =>
        set({
          autoRead: value,
        }),

      // Last seen LAN IP
      lastSeenIp: null,
      setLastSeenIp: (ip) =>
        set({
          lastSeenIp: ip,
        }),

      // Clear all data
      clearAllData: () => {
        const refs = get()
          .servers.map((s) => s.deviceTokenRef)
          .filter((r): r is string => !!r);

        set({
          servers: [],
          startupBehavior: "list",
          lastServerId: null,
        });
        zustandStorage.removeItem(STORE_NAME);
        useWsRules.getState().clearRules();
        useUnreadStore.getState().clearAll();

        for (const ref of refs) {
          clearSecureForServer(ref);
        }
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        servers: state.servers,
        startupBehavior: state.startupBehavior,
        lastServerId: state.lastServerId,
        localePref: state.localePref,
        lastSeenIp: state.lastSeenIp,
        autoRead: state.autoRead,
      }),
      migrate: (persisted, version) => {
        try {
          const state = (persisted || {}) as PersistedState & {
            startupBehavior?: StartupBehavior;
            lastServerId?: string | null;
            localePref?: LocalePref;
            lastSeenIp?: string | null;
            autoRead?: boolean;
          };
          const startupBehavior = state.startupBehavior;

          return {
            servers: migrateServers(state.servers),
            startupBehavior:
              startupBehavior === "last" || startupBehavior === "list"
                ? startupBehavior
                : "list",
            lastServerId:
              typeof state.lastServerId === "string"
                ? state.lastServerId
                : null,
            localePref: sanitizeLocalePref(state.localePref),
            lastSeenIp:
              typeof state.lastSeenIp === "string" ? state.lastSeenIp : null,
            autoRead: state.autoRead === true,
          };
        } catch {
          return {
            servers: [],
            startupBehavior: "list" as StartupBehavior,
            lastServerId: null,
            localePref: "system" as LocalePref,
            lastSeenIp: null,
            autoRead: false,
          };
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
