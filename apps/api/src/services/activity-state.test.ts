import { describe, expect, test } from "bun:test";

import { canReset, canTransition } from "./activity-state";

describe("activity lifecycle", () => {
  test("permits only the documented forward lifecycle", () => {
    expect(canTransition("draft", "live")).toBe(true);
    expect(canTransition("live", "locked")).toBe(true);
    expect(canTransition("locked", "revealed")).toBe(true);
    expect(canTransition("revealed", "ended")).toBe(true);
  });

  test("rejects reveal before lock and reopening after reveal", () => {
    expect(canTransition("live", "revealed")).toBe(false);
    expect(canTransition("revealed", "live")).toBe(false);
    expect(canTransition("ended", "live")).toBe(false);
  });

  test("reset is available only for an active or resolved round", () => {
    expect(canReset("draft")).toBe(false);
    expect(canReset("live")).toBe(true);
    expect(canReset("locked")).toBe(true);
    expect(canReset("revealed")).toBe(true);
    expect(canReset("ended")).toBe(false);
  });
});
