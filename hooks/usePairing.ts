import { randomUUID } from "expo-crypto";
import { useState } from "react";

import { createV2Client } from "@/lib/v2client";
import { normalizeOrigin, isPairConnectLink, parsePairLink, parseQrPayload, probeV2Session, redeemPairCode, QrPayload } from "@/lib/protocol";
import { classifyOrigin, hostOf, isTailscaleHost } from "@/lib/remotePolicy";
import { useT } from "@/lib/i18n";
import { saveDeviceToken } from "@/lib/secure";
import { ConnectionMode, RemoteProvider, useAppStore } from "@/stores";

export type PairMode = "lan" | "remote";
export type PairProvider = RemoteProvider | "lan";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function translateError(message: string, t: TFn): string {
  if (
    /fetch failed|ConnectException|Network request failed|Load failed|timed out|timedout|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|NetworkError/i.test(
      message,
    )
  ) {
    return t("errors.noConnection");
  }

  if (/^\s*invalid url/i.test(message)) {
    return t("errors.linkCode");
  }

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
    case "Pairing link is not a /auth/connect link":
      return t("errors.pairLink");
    case "Pairing code is missing from link":
      return t("errors.linkCode");
    case "Pairing link expired or already used":
      return t("errors.linkUsed");
    case "Server returned no session token":
      return t("errors.noToken");
    case "LAN_REMOTE_MISMATCH":
      return t("errors.lanRemoteMismatch");
    case "REMOTE_LAN_MISMATCH":
      return t("errors.remoteLanMismatch");
    case "REMOTE_HTTPS_REQUIRED":
      return t("errors.remoteHttpsRequired");
    case "Auth rejected (401) — re-pair this device":
      return t("diagDetail.authExpired");
    default:
      return message;
  }
}

interface PairResult {
  serverId: string;
  origin: string;
}

/**
 * Fail closed when the origin does not suit the pairing mode, so
 * credentials never go to the wrong kind of network. Remote entries must
 * additionally be HTTPS, except Tailscale overlay hosts whose transport
 * is already encrypted.
 */
function enforceOriginMode(origin: string, mode: PairMode): void {
  const cls = classifyOrigin(origin);

  if (mode === "lan" && cls === "remote") {
    throw new Error("LAN_REMOTE_MISMATCH");
  }

  if (mode === "remote" && cls !== "remote") {
    throw new Error("REMOTE_LAN_MISMATCH");
  }

  if (mode === "remote" && cls === "remote") {
    const host = hostOf(origin) ?? "";

    let secure = false;

    try {
      secure = new URL(origin.trim()).protocol === "https:";
    } catch {
      secure = false;
    }

    if (!secure && !isTailscaleHost(host)) {
      throw new Error("REMOTE_HTTPS_REQUIRED");
    }
  }
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
    enforceOriginMode(options.origin, options.mode);

    const client = createV2Client({
      baseUrl: options.origin,
      username: options.username,
      password: options.password,
    });

    try {
      await client.session.list({ limit: 1 });
    } catch {
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

  const saveV2Pairing = async (options: {
    link: string;
    customName: string;
    mode: PairMode;
    provider: PairProvider;
  }): Promise<PairResult> => {
    const { origin } = parsePairLink(options.link);

    enforceOriginMode(origin, options.mode);

    const token = await redeemPairCode(options.link);
    await probeV2Session(origin, "opencode", token);

    const tokenRef = randomUUID();
    await saveDeviceToken(tokenRef, token);

    try {
      const host = new URL(origin).hostname;

      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        setLastSeenIp(host);
      }
    } catch {
      // Origin already normalized — hostname parse cannot fail here.
    }

    const existing = servers.find((s) => s.url === origin);

    if (existing) {
      updateServer(existing.id, {
        url: origin,
        connectionMode: options.mode as ConnectionMode,
        provider:
          options.provider === "lan" ? undefined : options.provider,
        instanceId: undefined,
        caFingerprint: undefined,
        deviceTokenRef: tokenRef,
        username: "opencode",
        password: token,
        needsRepair: false,
      });

      return { serverId: existing.id, origin };
    }

    const id = randomUUID();
    addServer({
      name: options.customName.trim() || origin,
      url: origin,
      connectionMode: options.mode as ConnectionMode,
      provider:
        options.provider === "lan" ? undefined : options.provider,
      instanceId: undefined,
      caFingerprint: undefined,
      deviceTokenRef: tokenRef,
      username: "opencode",
      password: token,
    });

    const created = useAppStore
      .getState()
      .servers.find(
        (s) => s.url === origin && s.deviceTokenRef === tokenRef,
      );

    return { serverId: created?.id || id, origin };
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
    provider: PairProvider = "lan",
  ): Promise<PairResult | null> => {
    if (isPairConnectLink(qrJson)) {
      return runPairing(async () => {
        const { link } = parsePairLink(qrJson);

        return saveV2Pairing({
          link,
          customName,
          mode,
          provider,
        });
      });
    }

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
    if (isPairConnectLink(link)) {
      return runPairing(async () => {
        const { link: clean } = parsePairLink(link);

        return saveV2Pairing({
          link: clean,
          customName,
          mode,
          provider,
        });
      });
    }

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
