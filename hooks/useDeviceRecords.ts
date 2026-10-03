import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createV2Client } from "@/lib/v2client";
import { isAuthError } from "@/lib/v2types";
import { DeviceRecord, Reachability } from "@/lib/protocol";
import { Server, useAppStore } from "@/stores";

function toRecord(server: Server): DeviceRecord {
  return {
    id: server.id,
    customName: server.name,
    mode:
      server.connectionMode === "remote" || server.connectionMode === "relay"
        ? "remote"
        : "lan",
    origin: server.url,
    reachable: "checking",
    lastConnectedAt: server.lastConnectedAt || "",
  };
}

export function useDeviceRecords(servers: Server[]) {
  const [status, setStatus] = useState<Record<string, Reachability>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const updateServer = useAppStore((s) => s.updateServer);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const check = useCallback(
    async (server: Server): Promise<Reachability> => {
      setChecking((prev) => ({ ...prev, [server.id]: true }));
      setStatus((prev) => ({ ...prev, [server.id]: "checking" }));

      let result: Reachability = "unreachable";

      try {
        const client = createV2Client({
          baseUrl: server.url,
          username: server.username,
          password: server.password,
        });
        await client.session.list({ limit: 1 });
        result = "ok";
      } catch (err) {
        if (isAuthError(err)) {
          result = "expired";
        } else {
          result = "unreachable";
        }
      }

      if (!mounted.current) {
        return result;
      }

      setStatus((prev) => ({ ...prev, [server.id]: result }));
      setChecking((prev) => ({ ...prev, [server.id]: false }));

      if (result === "ok") {
        updateServer(server.id, {
          lastConnectedAt: new Date().toISOString(),
        });
      }

      return result;
    },
    [updateServer],
  );

  const cache = useRef<Map<string, DeviceRecord>>(new Map());

  const records: DeviceRecord[] = useMemo(() => {
    const out: DeviceRecord[] = [];
    const seen = new Set<string>();

    for (const s of servers) {
      seen.add(s.id);
      const next: DeviceRecord = {
        ...toRecord(s),
        reachable: status[s.id] || "checking",
      };
      const prev = cache.current.get(s.id);

      if (
        prev &&
        prev.customName === next.customName &&
        prev.mode === next.mode &&
        prev.origin === next.origin &&
        prev.reachable === next.reachable &&
        prev.lastConnectedAt === next.lastConnectedAt
      ) {
        out.push(prev);
      } else {
        cache.current.set(s.id, next);
        out.push(next);
      }
    }

    for (const id of [...cache.current.keys()]) {
      if (!seen.has(id)) {
        cache.current.delete(id);
      }
    }

    return out;
  }, [servers, status]);

  return {
    records,
    checking,
    check,
  };
}
