import { randomUUID } from "expo-crypto";
import { useState } from "react";

import { createClient } from "@/lib/opencode-client";
import { isSecureOrigin, normalizeOrigin, parseQrPayload, QrPayload } from "@/lib/protocol";
import { useT } from "@/lib/i18n";
import { saveDeviceToken } from "@/lib/secure";
import { ConnectionMode, RemoteProvider, useAppStore } from "@/stores";

export type PairMode = "lan" | "remote";
export type PairProvider = RemoteProvider | "lan";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function translateError(message: string, t: TFn): string {
  switch (message) {
    case "Unsupported protocol version":
      return t("errors.badVersion");
    case "Invalid QR payload":
      return t("errors.invalidQr");
    case "Origin must be https":
      return t("errors.httpsOnly");
    case "Pairing link has no code (?code= or #code)":
      return t("errors.linkCode");
    case "Pairing link has no code after #":
      return t("errors.linkEmptyHash");
    case "Please enter the pairing code":
      return t("errors.needCode");
    default:
      return message;
  }
}

interface PairResult {
  serverId: string;
  origin: string;
}

function extractFromLink(link: string): { origin: string; code: string } {
  const trimmed = link.trim();

  if (trimmed.includes("#")) {
    const hash = trimmed.split("#").pop() || "";

    if (!hash) {
      throw new Error("Pairing link has no code after #");
    }

    const originPart = trimmed.slice(0, trimmed.indexOf("#"));
    const origin = normalizeOrigin(originPart);

    return { origin, code: hash };
  }

  const parsed = new URL(trimmed);
  const code = parsed.searchParams.get("code");

  if (!code) {
    throw new Error("Pairing link has no code (?code= or #code)");
  }

  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = "";

  return { origin: normalizeOrigin(parsed.toString()), code };
}

export function usePairing() {
  const { t } = useT();
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addServer = useAppStore((s) => s.addServer);
  const servers = useAppStore((s) => s.servers);
  const updateServer = useAppStore((s) => s.updateServer);
  const setLastSeenIp = useAppStore((s) => s.setLastSeenIp);

  const savePairing = async (options: {
    origin: string;
    pairingCode: string;
    customName: string;
    mode: PairMode;
    provider: PairProvider;
    instanceId?: string;
    caFingerprint?: string;
    username?: string;
    password?: string;
  }): Promise<PairResult> => {
    if (options.mode === "remote" && !isSecureOrigin(options.origin)) {
      throw new Error(t("errors.httpsOnly"));
    }

    const client = createClient({
      baseUrl: options.origin,
      username: options.username,
      password: options.password,
    });
    const probe = await client.session.list().catch(() => null);

    if (!probe || probe.error || !probe.data) {
      throw new Error(t("errors.noConnection"));
    }

    const tokenRef = options.pairingCode
      ? randomUUID()
      : undefined;

    if (options.pairingCode && tokenRef) {
      await saveDeviceToken(tokenRef, options.pairingCode);
    }

    try {
      const host = new URL(options.origin).hostname;

      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        setLastSeenIp(host);
      }
    } catch {
      // Origin already normalized — hostname parse cannot fail here.
    }

    const existing = servers.find((s) => {
      if (options.instanceId && s.instanceId) {
        return s.instanceId === options.instanceId;
      }

      return s.url === options.origin;
    });

    if (existing) {
      updateServer(existing.id, {
        url: options.origin,
        connectionMode: options.mode as ConnectionMode,
        provider:
          options.provider === "lan" ? undefined : options.provider,
        instanceId: options.instanceId,
        caFingerprint: options.caFingerprint,
        deviceTokenRef: tokenRef,
        username: options.username,
        password: options.password,
        needsRepair: false,
      });

      return { serverId: existing.id, origin: options.origin };
    }

    const id = randomUUID();
    addServer({
      name: options.customName.trim() || options.origin,
      url: options.origin,
      connectionMode: options.mode as ConnectionMode,
      provider:
        options.provider === "lan" ? undefined : options.provider,
      instanceId: options.instanceId,
      caFingerprint: options.caFingerprint,
      deviceTokenRef: tokenRef,
      username: options.username,
      password: options.password,
    });

    const created = useAppStore
      .getState()
      .servers.find(
        (s) => s.url === options.origin && s.deviceTokenRef === tokenRef,
      );

    return { serverId: created?.id || id, origin: options.origin };
  };

  const runPairing = async (
    fn: () => Promise<PairResult>,
  ): Promise<PairResult | null> => {
    setPairing(true);
    setError(null);

    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.pairingFailed");
      setError(translateError(message, t));

      return null;
    } finally {
      setPairing(false);
    }
  };

  const pairWithQr = (
    qrJson: string,
    customName: string,
    mode: PairMode,
  ): Promise<PairResult | null> => {
    return runPairing(async () => {
      const payload: QrPayload = parseQrPayload(qrJson);

      return savePairing({
        origin: payload.origin,
        pairingCode: payload.pairing,
        customName,
        mode,
        provider: payload.provider,
        instanceId: payload.instanceId,
        caFingerprint: payload.caFp,
      });
    });
  };

  const pairWithLink = (
    link: string,
    customName: string,
    mode: PairMode,
    provider: PairProvider,
  ): Promise<PairResult | null> => {
    return runPairing(async () => {
      const { origin, code } = extractFromLink(link);

      return savePairing({
        origin,
        pairingCode: code,
        customName,
        mode,
        provider,
      });
    });
  };

  const pairWithKey = (
    originRaw: string,
    code: string,
    customName: string,
    mode: PairMode,
    provider: PairProvider,
    auth?: { username?: string; password?: string },
  ): Promise<PairResult | null> => {
    return runPairing(async () => {
      const origin = normalizeOrigin(originRaw.trim());

      return savePairing({
        origin,
        pairingCode: code.trim(),
        customName,
        mode,
        provider,
        username: auth?.username?.trim() || undefined,
        password: auth?.password?.trim() || undefined,
      });
    });
  };

  const reset = () => {
    setError(null);
  };

  return {
    pairing,
    error,
    pairWithQr,
    pairWithLink,
    pairWithKey,
    reset,
  };
}
