// Pairing host policy: which origins belong to LAN vs remote mode.
//
// Adapted from dsh-mobile's RemoteHostPolicy (Apache-2.0, saya-ch/dsh-mobile):
// credentials must never go to the wrong kind of origin, so LAN mode only
// accepts loopback/LAN hosts and remote mode only globally-reachable ones.
// Dependency-free on purpose: runnable under bun/node for unit checks.

const TUNNEL_SUFFIXES = [
  ".trycloudflare.com",
  ".cfargotunnel.com",
  ".ts.net",
  ".cpolar.cn",
  ".cpolar.io",
  ".cpolar.top",
  ".cpolar.com",
];

const LAN_SUFFIXES = [".local", ".lan", ".home", ".internal"];

export function hostOf(origin: string): string | null {
  try {
    return new URL(origin.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function octets(host: string): number[] | null {
  const parts = host.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const nums: number[] = [];

  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) {
      return null;
    }

    const n = Number.parseInt(part, 10);

    if (n < 0 || n > 255) {
      return null;
    }

    nums.push(n);
  }

  return nums;
}

function inCidr(oct: number[], base: number[], prefix: number): boolean {
  const bits = prefix;

  for (let i = 0; i < 4; i++) {
    const take = Math.max(0, Math.min(8, bits - i * 8));

    if (take === 0) {
      return true;
    }

    const mask = (0xff << (8 - take)) & 0xff;

    if ((oct[i] & mask) !== (base[i] & mask)) {
      return false;
    }

    if (take < 8) {
      return true;
    }
  }

  return true;
}

function isLoopback(host: string): boolean {
  if (host === "localhost" || host === "::1" || host === "[::1]") {
    return true;
  }

  const oct = octets(host);

  return oct !== null && inCidr(oct, [127, 0, 0, 0], 8);
}

function isPrivateIpv4(host: string): boolean {
  const oct = octets(host);

  if (!oct) {
    return false;
  }

  return (
    inCidr(oct, [10, 0, 0, 0], 8) ||
    inCidr(oct, [172, 16, 0, 0], 12) ||
    inCidr(oct, [192, 168, 0, 0], 16) ||
    inCidr(oct, [169, 254, 0, 0], 16)
  );
}

function isLanSuffix(host: string): boolean {
  return LAN_SUFFIXES.some((s) => host.endsWith(s));
}

function isTunnelHost(host: string): boolean {
  return TUNNEL_SUFFIXES.some((s) => host.endsWith(s));
}

function isPublicIpv4(host: string): boolean {
  const oct = octets(host);

  if (!oct) {
    return false;
  }

  if (
    isLoopback(host) ||
    isPrivateIpv4(host) ||
    inCidr(oct, [0, 0, 0, 0], 8) ||
    inCidr(oct, [192, 0, 2, 0], 24) ||
    inCidr(oct, [198, 51, 100, 0], 24) ||
    inCidr(oct, [203, 0, 113, 0], 24) ||
    inCidr(oct, [224, 0, 0, 0], 4)
  ) {
    return false;
  }

  return true;
}

function isPublicDns(host: string): boolean {
  const clean = host.replace(/\.+$/, "");

  if (
    !clean ||
    clean.includes(":") ||
    clean === "localhost" ||
    isLanSuffix(clean)
  ) {
    return false;
  }

  const labels = clean.split(".");

  if (labels.length < 2 || labels.every((l) => /^\d+$/.test(l))) {
    return false;
  }

  return labels.every(
    (l) =>
      l.length > 0 &&
      l.length <= 63 &&
      /^[A-Za-z0-9]$/.test(l[0]) &&
      /^[A-Za-z0-9]$/.test(l[l.length - 1]) &&
      /^[A-Za-z0-9-]+$/.test(l),
  );
}

/** True when the host can only be reached outside the local network. */
export function isRemoteHost(host: string): boolean {
  const h = host.toLowerCase();

  return isTunnelHost(h) || isPublicIpv4(h) || isPublicDns(h);
}

/** Tailscale overlay addresses may use HTTP: transport is already encrypted. */
export function isTailscaleHost(host: string): boolean {
  return host.toLowerCase().endsWith(".ts.net");
}

export type OriginClass = "lan" | "remote" | "invalid";

/** Classify an origin for mode checking. Unparseable counts as invalid. */
export function classifyOrigin(origin: string): OriginClass {
  const host = hostOf(origin);

  if (!host) {
    return "invalid";
  }

  return isRemoteHost(host) ? "remote" : "lan";
}
