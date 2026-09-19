import * as Network from "expo-network";
import { useCallback, useRef, useState } from "react";

import { useT } from "@/lib/i18n";

export interface LanHost {
  ip: string;
  origin: string;
  latencyMs: number;
}

const DEFAULT_PORT = 4096;
const PROBE_TIMEOUT_MS = 1500;
const CONCURRENCY = 20;

function prefixOf(ip: string): string | null {
  const parts = ip.trim().split(".");

  if (parts.length !== 4 || parts.some((p) => p === "" || Number.isNaN(Number(p)))) {
    return null;
  }

  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

async function probe(
  ip: string,
  port: number,
  signal: AbortSignal,
): Promise<LanHost | null> {
  const origin = `http://${ip}:${port}`;
  const started = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, PROBE_TIMEOUT_MS);

  const onAbort = () => {
    controller.abort();
  };
  signal.addEventListener("abort", onAbort);

  try {
    await fetch(`${origin}/session`, {
      method: "GET",
      signal: controller.signal,
    });

    return { ip, origin, latencyMs: Date.now() - started };
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("401") || err.message.includes("403"))
    ) {
      return { ip, origin, latencyMs: Date.now() - started };
    }

    if (err instanceof Response) {
      return { ip, origin, latencyMs: Date.now() - started };
    }

    return null;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
  }
}

export function useLanSweep() {
  const { t } = useT();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);
  const [hosts, setHosts] = useState<LanHost[]>([]);
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const scan = useCallback(async (port: number = DEFAULT_PORT, preferredIp?: string | null) => {
    abortRef.current?.abort();
    const aborter = new AbortController();
    abortRef.current = aborter;

    setScanning(true);
    setScanned(0);
    setHosts([]);
    setError(null);

    try {
      const ip = await Network.getIpAddressAsync();
      setLocalIp(ip);

      const prefix = prefixOf(ip);

      if (!prefix) {
        throw new Error(t("errors.no24", { ip }));
      }

      const candidates: string[] = [];
      for (let i = 1; i <= 254; i++) {
        const candidate = `${prefix}.${i}`;

        if (candidate !== ip) {
          candidates.push(candidate);
        }
      }

      if (preferredIp && prefixOf(preferredIp) === prefix && preferredIp !== ip) {
        const at = candidates.indexOf(preferredIp);

        if (at > 0) {
          candidates.splice(at, 1);
          candidates.unshift(preferredIp);
        }
      }

      setTotal(candidates.length);

      const found: LanHost[] = [];
      let done = 0;

      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        if (aborter.signal.aborted) {
          break;
        }

        const batch = candidates.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map((candidate) => probe(candidate, port, aborter.signal)),
        );

        for (const host of results) {
          if (host) {
            found.push(host);
          }
        }

        done += batch.length;

        if (!aborter.signal.aborted) {
          setScanned(done);
          setHosts([...found].sort((a, b) => a.latencyMs - b.latencyMs));
        }
      }
    } catch (err) {
      if (!aborter.signal.aborted) {
        setError(err instanceof Error ? err.message : t("errors.failed"));
      }
    } finally {
      if (abortRef.current === aborter) {
        abortRef.current = null;
      }

      setScanning(false);
    }
  }, []);

  return {
    scanning,
    scanned,
    total,
    hosts,
    localIp,
    error,
    scan,
    cancel,
    defaultPort: DEFAULT_PORT,
  };
}
