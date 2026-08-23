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
});
