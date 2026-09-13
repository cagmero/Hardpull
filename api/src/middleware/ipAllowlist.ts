import type { MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

// IP allowlist, the fourth link in docs/architecture.md #2.3's middleware chain. Institutional
// API consumers routinely require their integrations to be reachable only from declared egress
// ranges, and a credit bureau is exactly the kind of counterparty that gets asked for it.
//
// Unset HARDPULL_IP_ALLOWLIST means allow everything -- that is the correct default for local
// development and for the public demo, and it is announced at startup rather than left silent
// (see describeAllowlist, surfaced on /health/ready).

export interface AllowlistEntry {
  address: string;
  prefixLength: number;
}

function parseIpv4(address: string): number | null {
  const octets = address.split(".");
  if (octets.length !== 4) return null;

  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    const n = Number(octet);
    if (n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

/** Parses "10.0.0.1, 192.168.0.0/16" into entries. Invalid entries are rejected loudly. */
export function parseAllowlist(raw: string | undefined): AllowlistEntry[] {
  if (!raw?.trim()) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [address, prefix] = entry.split("/");
      if (parseIpv4(address) === null) {
        throw new Error(`HARDPULL_IP_ALLOWLIST contains an invalid IPv4 address: ${entry}`);
      }
      const prefixLength = prefix === undefined ? 32 : Number(prefix);
      if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
        throw new Error(`HARDPULL_IP_ALLOWLIST contains an invalid CIDR prefix: ${entry}`);
      }
      return { address, prefixLength };
    });
}

export function isAllowed(ip: string, allowlist: AllowlistEntry[]): boolean {
  if (allowlist.length === 0) return true;

  // An IPv4-mapped IPv6 address (::ffff:203.0.113.7) is how Node reports IPv4 on a dual-stack
  // socket; compare the embedded IPv4 rather than failing the match.
  const normalized = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  const candidate = parseIpv4(normalized);
  if (candidate === null) return false;

  return allowlist.some(({ address, prefixLength }) => {
    if (prefixLength === 0) return true;
    const mask = prefixLength === 32 ? 0xffffffff : ~((1 << (32 - prefixLength)) - 1) >>> 0;
    return (candidate & mask) >>> 0 === (parseIpv4(address)! & mask) >>> 0;
  });
}

/**
 * Resolves the caller's IP. Behind a proxy the socket address is the proxy's, so
 * X-Forwarded-For's first hop is used -- but only when TRUST_PROXY is set, because that header
 * is caller-supplied and trusting it unconditionally would let anyone forge an allowed source.
 */
export function callerIp(forwardedFor: string | undefined, socketAddress: string | undefined, trustProxy: boolean): string {
  if (trustProxy && forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return socketAddress ?? "";
}

export function describeAllowlist(): { enforced: boolean; entries: number; trustProxy: boolean } {
  const entries = parseAllowlist(process.env.HARDPULL_IP_ALLOWLIST);
  return {
    enforced: entries.length > 0,
    entries: entries.length,
    trustProxy: process.env.TRUST_PROXY === "true",
  };
}

export const ipAllowlist: MiddlewareHandler = async (c, next) => {
  const allowlist = parseAllowlist(process.env.HARDPULL_IP_ALLOWLIST);
  if (allowlist.length === 0) return next();

  const socketAddress = getConnInfo(c).remote.address;
  const ip = callerIp(c.req.header("x-forwarded-for"), socketAddress, process.env.TRUST_PROXY === "true");

  if (!isAllowed(ip, allowlist)) {
    // Deliberately does not echo the rejected IP or the allowlist back to the caller.
    return c.json({ error: "IP_NOT_ALLOWED", message: "Source address is not permitted" }, 403);
  }

  return next();
};
