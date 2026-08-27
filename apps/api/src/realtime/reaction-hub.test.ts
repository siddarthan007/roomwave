import { afterEach, describe, expect, test } from "bun:test";

import { REACTION_LEADING_MS, reactionHub } from "./reaction-hub";
import { roomHub } from "./room-hub";

let roomId = "";
let unsubscribe = () => {};

afterEach(() => {
  unsubscribe();
  if (roomId) reactionHub.forget(roomId);
  roomId = "";
});

describe("reaction hub", () => {
  test("first tap publishes within a frame so other screens can paint", async () => {
    roomId = crypto.randomUUID();
    const bursts: Array<{ kind: string; count: number; bucket: number }> = [];
    unsubscribe = roomHub.subscribe(roomId, (event) => {
      if (event.type === "reactions") bursts.push(event.burst);
    });

    reactionHub.add(roomId, "clap");
    reactionHub.add(roomId, "clap");
    reactionHub.add(roomId, "flame");

    await Bun.sleep(REACTION_LEADING_MS + 30);

    expect(bursts).toEqual([
      { kind: "clap", count: 2, bucket: expect.any(Number) },
      { kind: "flame", count: 1, bucket: expect.any(Number) },
    ]);
  });
});
