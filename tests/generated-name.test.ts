import { describe, expect, test } from "bun:test";

import { generatedRoomName, ROOM_NAME_FIRST, ROOM_NAME_SECOND } from "../packages/shared/src";

describe("generatedRoomName", () => {
  test("is deterministic for the same seed", () => {
    expect(generatedRoomName("ticket-seed")).toBe(generatedRoomName("ticket-seed"));
  });

  test("changes when the seed changes", () => {
    expect(generatedRoomName("alpha")).not.toBe(generatedRoomName("beta"));
  });

  test("stays inside the join-name length cap and word lists", () => {
    for (const seed of ["a", "avatar-seed-01", "11111111-1111-1111-1111-111111111111"]) {
      const name = generatedRoomName(seed);
      expect(name.length).toBeLessThanOrEqual(24);
      const [first, second] = name.split(" ");
      expect(ROOM_NAME_FIRST).toContain(first);
      expect(ROOM_NAME_SECOND).toContain(second);
    }
  });
});
