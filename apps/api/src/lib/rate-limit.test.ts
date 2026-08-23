import { describe, expect, test } from "bun:test";

import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  test("blocks excess hits and recovers when the window moves", () => {
    const limiter = new RateLimiter(2, 1_000);
    expect(limiter.allow("person", 10_000)).toBe(true);
    expect(limiter.allow("person", 10_100)).toBe(true);
    expect(limiter.allow("person", 10_200)).toBe(false);
    expect(limiter.allow("person", 11_001)).toBe(true);
  });

  test("keeps independent identities independent", () => {
    const limiter = new RateLimiter(1, 1_000);
    expect(limiter.allow("a", 10_000)).toBe(true);
    expect(limiter.allow("a", 10_001)).toBe(false);
    expect(limiter.allow("b", 10_001)).toBe(true);
  });
});
