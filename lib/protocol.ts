import { RemoteProvider } from "@/stores";

export const PROTOCOL_VERSION = 1;

export interface QrPayload {
  v: number;
  origin: string;
  instanceId: string;
  caFp: string;
  pairing: string;
  provider: RemoteProvider | "lan";
}

export type Reachability =
  | "ok"
  | "checking"
  | "unreachable"
  | "revoked"
  | "expired";

export interface DeviceRecord {
  id: string;
  customName: string;
  mode: "lan" | "remote";
  origin: string;
  reachable: Reachability;
  lastConnectedAt: string;
}

export interface WsRule {
  path: string;
  allowed: boolean;
  hits: number;
}

export interface DiagnosticReport {
  app: string;
  plugin: string;
  proto: number;
  gateway: string;
  iface: string;
  firewall: string;
  remote: {
    provider: RemoteProvider | "none";
    state: string;
  };
  blockedWs: WsRule[];
}

export function normalizeOrigin(raw: string): string {
  const parsed = new URL(raw);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Origin must be https");
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port ? `:${parsed.port}` : "";

  return `${parsed.protocol}//${host}${port}`;
}

export function isSecureOrigin(origin: string): boolean {
  return origin.startsWith("https://");
}

export function parseQrPayload(raw: string): QrPayload {
  const data = JSON.parse(raw) as QrPayload;

  if (data.v !== PROTOCOL_VERSION) {
    throw new Error("Unsupported protocol version");
  }

  if (!data.origin || !data.instanceId || !data.caFp || !data.pairing) {
    throw new Error("Invalid QR payload");
  }

  return {
    ...data,
    origin: normalizeOrigin(data.origin),
  };
}

export function isExpiredRecord(record: DeviceRecord): boolean {
  return record.reachable === "revoked" || record.reachable === "expired";
}

const PAIR_CONNECT_RE = /^\/auth\/connect\/([^/]+)\/?$/;

export interface PairLink {
  origin: string;
  code: string;
  link: string;
}

export function isPairConnectLink(raw: string): boolean {
  try {
    return PAIR_CONNECT_RE.test(new URL(raw.trim()).pathname);
  } catch {
    return false;
  }
}

export function parsePairLink(raw: string): PairLink {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Pairing link is not a /auth/connect link");
  }

  const match = PAIR_CONNECT_RE.exec(parsed.pathname);

  if (!match || !match[1]) {
    throw new Error("Pairing link is not a /auth/connect link");
  }

  const code = decodeURIComponent(match[1]);

  if (!code) {
    throw new Error("Pairing code is missing from link");
  }

  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = "";

  return {
    origin: normalizeOrigin(parsed.toString()),
    code,
    link: raw.trim(),
  };
}

export async function redeemPairCode(link: string, signal?: AbortSignal): Promise<string> {
  const { link: clean } = parsePairLink(link);
  const res = await fetch(clean, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (res.status === 401) {
    throw new Error("Pairing link expired or already used");
  }

  if (!res.ok) {
    throw new Error("Could not connect to server");
  }

  const body = (await res.json()) as { token?: unknown };

  if (typeof body.token !== "string" || !body.token) {
    throw new Error("Server returned no session token");
  }

  return body.token;
}

export async function probeV2Session(
  origin: string,
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${origin}/api/info`, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    },
    signal,
  });

  if (res.status === 401) {
    throw new Error("Auth rejected (401) — re-pair this device");
  }

  if (!res.ok) {
    throw new Error("Could not connect to server");
  }
}
