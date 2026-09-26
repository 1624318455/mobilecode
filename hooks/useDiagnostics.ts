import * as Application from "expo-application";
import { useCallback, useState } from "react";

import { createClient } from "@/lib/opencode-client";
import { useT } from "@/lib/i18n";
import { DiagnosticReport, PROTOCOL_VERSION, WsRule } from "@/lib/protocol";
import { Server } from "@/stores";
import { useDiagLogStore } from "@/stores/diagLog";

export type GatewayState = "ok" | "down" | "expired" | "unknown";

interface ServerCheck {
  state: GatewayState;
  latencyMs: number | null;
  detail: string;
}

export function useDiagnostics(servers: Server[]) {
  const { t } = useT();
  const [checks, setChecks] = useState<Record<string, ServerCheck>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [blockedWs, setBlockedWs] = useState<Record<string, WsRule[]>>({});

  const checkServer = useCallback(async (server: Server) => {
    setChecking((prev) => ({ ...prev, [server.id]: true }));

    const started = Date.now();
    let result: ServerCheck = {
      state: "down",
      latencyMs: null,
      detail: t("diagDetail.noResponse"),
    };

    try {
      const client = createClient({
        baseUrl: server.url,
        username: server.username,
        password: server.password,
      });
      const res = await client.session.list();

      if (res.data && !res.error) {
        result = {
          state: "ok",
          latencyMs: Date.now() - started,
          detail: t("diagDetail.sessions", { n: res.data.length }),
        };
      } else {
        const text = JSON.stringify(res.error);

        if (text.includes("401")) {
          result = {
            state: "expired",
            latencyMs: Date.now() - started,
            detail: t("diagDetail.authExpired"),
          };
        } else {
          result = {
            state: "down",
            latencyMs: Date.now() - started,
            detail: t("diagDetail.serverError"),
          };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Check failed";

      if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
        result = { state: "expired", latencyMs: null, detail: t("diagDetail.authExpired") };
      } else {
        result = { state: "down", latencyMs: null, detail: message };
      }
    }

    setChecks((prev) => ({ ...prev, [server.id]: result }));
    setChecking((prev) => ({ ...prev, [server.id]: false }));
    useDiagLogStore.getState().log(
      server.name,
      result.state === "ok" ? "success" : "error",
      result.latencyMs !== null
        ? `${result.detail} · ${result.latencyMs}ms`
        : result.detail,
    );

    return result;
  }, [t]);

  const checkAll = useCallback(async () => {
    for (const server of servers) {
      await checkServer(server);
    }
  }, [servers, checkServer]);

  const recordBlocked = useCallback((serverId: string, path: string) => {
    setBlockedWs((prev) => {
      const list = prev[serverId] || [];
      const existing = list.find((r) => r.path === path);

      if (existing) {
        return {
          ...prev,
          [serverId]: list.map((r) =>
            r.path === path ? { ...r, hits: r.hits + 1 } : r,
          ),
        };
      }

      return {
        ...prev,
        [serverId]: [...list, { path, allowed: false, hits: 1 }],
      };
    });
  }, []);

  const buildReport = useCallback((): DiagnosticReport => {
    const blocked: WsRule[] = Object.values(blockedWs).flat();

    return {
      app: Application.nativeApplicationVersion || "unknown",
      plugin: "none",
      proto: PROTOCOL_VERSION,
      gateway: servers.length === 0 ? "no-servers" : "checked-per-server",
      iface: "not-probed",
      firewall: "not-probed",
      remote: {
        provider: servers.some((s) => s.connectionMode === "remote")
          ? "cloudflared-quick"
          : "none",
        state: "not-probed",
      },
      blockedWs: blocked,
    };
  }, [servers, blockedWs]);

  return {
    checks,
    checking,
    checkServer,
    checkAll,
    blockedWs,
    recordBlocked,
    buildReport,
  };
}
