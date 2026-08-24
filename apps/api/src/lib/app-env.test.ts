import { describe, expect, test } from "bun:test";

import { resolveClientAddress } from "./app-env";

describe("client address resolution", () => {
  test("ignores forwarding headers from an untrusted socket peer", () => {
    expect(
      resolveClientAddress(
        "203.0.113.9",
        "198.51.100.1",
        new Set(["127.0.0.1"]),
      ),
    ).toBe("203.0.113.9");
  });

  test("walks a trusted proxy chain and stops before spoofed values", () => {
    expect(
      resolveClientAddress(
        "10.0.0.2",
        "192.0.2.44, 198.51.100.8, 10.0.0.1",
        new Set(["10.0.0.1", "10.0.0.2"]),
      ),
    ).toBe("198.51.100.8");
  });

  test("rejects malformed peer identities", () => {
    expect(
      resolveClientAddress("not-an-ip", "198.51.100.8", new Set()),
    ).toBe("unknown");
  });

  test("spoofed left-hand value equal to a trusted proxy IP cannot pin the bucket", () => {
    // Attacker sends "X-Forwarded-For: 10.0.0.1" through one trusted proxy.
    // The proxy appends the attacker's real address; the chain becomes
    // "10.0.0.1, <attacker>". With a single trusted hop the answer must be
    // the attacker's real address — never the trusted proxy IP itself.
    expect(
      resolveClientAddress(
        "10.0.0.1",
        "10.0.0.1, 203.0.113.77",
        new Set(["10.0.0.1"]),
      ),
    ).toBe("203.0.113.77");
    // Pure spoof with no proxy-appended value: the budget runs out on the
    // untrusted claim and the socket peer is used as-is.
    expect(
      resolveClientAddress("10.0.0.1", "10.0.0.1", new Set(["10.0.0.1"])),
    ).toBe("10.0.0.1");
  });

  test("two-proxy chain resolves past both trusted hops", () => {
    expect(
      resolveClientAddress(
        "10.0.0.2",
        "198.51.100.7, 10.0.0.1",
        new Set(["10.0.0.1", "10.0.0.2"]),
      ),
    ).toBe("198.51.100.7");
    // A third, untrusted entry is ignored: only two hops are trusted.
    expect(
      resolveClientAddress(
        "10.0.0.2",
        "192.0.2.9, 198.51.100.7, 10.0.0.1",
        new Set(["10.0.0.1", "10.0.0.2"]),
      ),
    ).toBe("198.51.100.7");
  });

  test("non-IP chain entries are dropped before the hop walk", () => {
    expect(
      resolveClientAddress(
        "10.0.0.1",
        "unknown, 203.0.113.5",
        new Set(["10.0.0.1"]),
      ),
    ).toBe("203.0.113.5");
  });
});
