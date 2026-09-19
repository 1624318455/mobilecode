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
