import { describe, it, expect } from "vitest";
import { parseAllowlist, isAllowed, callerIp } from "../ipAllowlist.js";

describe("parseAllowlist", () => {
  it("treats an unset or blank value as no allowlist", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
    expect(parseAllowlist("   ")).toEqual([]);
  });

  it("parses bare addresses as /32 and preserves explicit prefixes", () => {
    expect(parseAllowlist("10.0.0.1, 192.168.0.0/16")).toEqual([
      { address: "10.0.0.1", prefixLength: 32 },
      { address: "192.168.0.0", prefixLength: 16 },
    ]);
  });

  it("rejects malformed entries rather than silently ignoring them", () => {
    // Silently dropping a bad entry would quietly widen the allowlist, which is the one
    // failure mode an allowlist must never have.
    expect(() => parseAllowlist("not-an-ip")).toThrow(/invalid IPv4 address/);
    expect(() => parseAllowlist("10.0.0.256")).toThrow(/invalid IPv4 address/);
    expect(() => parseAllowlist("10.0.0.1/33")).toThrow(/invalid CIDR prefix/);
    expect(() => parseAllowlist("10.0.0.1/abc")).toThrow(/invalid CIDR prefix/);
  });
});

describe("isAllowed", () => {
  it("allows everything when the allowlist is empty", () => {
    expect(isAllowed("203.0.113.7", [])).toBe(true);
  });

  it("matches an exact address", () => {
    const list = parseAllowlist("203.0.113.7");
    expect(isAllowed("203.0.113.7", list)).toBe(true);
    expect(isAllowed("203.0.113.8", list)).toBe(false);
  });

  it("matches within a CIDR range and rejects outside it", () => {
    const list = parseAllowlist("192.168.0.0/16");
    expect(isAllowed("192.168.0.1", list)).toBe(true);
    expect(isAllowed("192.168.255.255", list)).toBe(true);
    expect(isAllowed("192.169.0.1", list)).toBe(false);
  });

  it("handles /24 boundaries exactly", () => {
    const list = parseAllowlist("10.1.2.0/24");
    expect(isAllowed("10.1.2.0", list)).toBe(true);
    expect(isAllowed("10.1.2.255", list)).toBe(true);
    expect(isAllowed("10.1.3.0", list)).toBe(false);
    expect(isAllowed("10.1.1.255", list)).toBe(false);
  });

  it("treats /0 as match-all", () => {
    expect(isAllowed("203.0.113.7", parseAllowlist("0.0.0.0/0"))).toBe(true);
  });

  it("unwraps IPv4-mapped IPv6, which is how Node reports IPv4 on a dual-stack socket", () => {
    expect(isAllowed("::ffff:192.168.1.5", parseAllowlist("192.168.0.0/16"))).toBe(true);
  });

  it("rejects an address it cannot parse instead of failing open", () => {
    const list = parseAllowlist("192.168.0.0/16");
    expect(isAllowed("2001:db8::1", list)).toBe(false);
    expect(isAllowed("", list)).toBe(false);
  });
});

describe("callerIp", () => {
  it("ignores X-Forwarded-For unless the proxy is trusted", () => {
    // The header is caller-supplied. Trusting it by default would let anyone claim an allowed
    // source address just by setting a header.
    expect(callerIp("1.2.3.4", "203.0.113.7", false)).toBe("203.0.113.7");
  });

  it("uses the first forwarded hop when the proxy is trusted", () => {
    expect(callerIp("1.2.3.4, 10.0.0.1", "203.0.113.7", true)).toBe("1.2.3.4");
  });

  it("falls back to the socket address when the header is absent", () => {
    expect(callerIp(undefined, "203.0.113.7", true)).toBe("203.0.113.7");
  });

  it("returns an empty string when nothing identifies the caller, which no allowlist matches", () => {
    expect(callerIp(undefined, undefined, true)).toBe("");
    expect(isAllowed(callerIp(undefined, undefined, true), parseAllowlist("10.0.0.0/8"))).toBe(false);
  });
});
