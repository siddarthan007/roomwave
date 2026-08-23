import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { app } from "../index";
import { db } from "../db";
import { rooms } from "../db/schema";
import { roomHub } from "../realtime/room-hub";

let roomId = "";

afterEach(() => {
  if (roomId) db.delete(rooms).where(eq(rooms.id, roomId)).run();
  roomId = "";
});

describe("room event stream", () => {
  test("every connection begins with a reconstructable snapshot and cleans up", async () => {
    roomId = crypto.randomUUID();
    db.insert(rooms)
      .values({
        id: roomId,
        code: `S${roomId.slice(0, 5).toUpperCase()}`,
        title: "Stream room",
        hostTokenHash: "host",
        status: "lobby",
        activeActivityId: null,
        createdAt: new Date().toISOString(),
      })
      .run();

    const controller = new AbortController();
    const response = await app.request(`/api/rooms/${roomId}/events`, {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body!.getReader();
    const first = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("snapshot timed out")), 2_000),
      ),
    ]);
    const text = new TextDecoder().decode(first.value);
    expect(text).toContain("event: room.snapshot");
    expect(text).toContain('"participantCount":0');
    expect(roomHub.subscriberCount(roomId)).toBe(1);

    roomHub.publish(roomId, {
      type: "participant.count",
      roomId,
      count: 1,
    });
    const pushed = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("live event timed out")), 2_000),
      ),
    ]);
    const pushedText = new TextDecoder().decode(pushed.value);
    expect(pushedText).toContain("event: participant.count");
    expect(pushedText).toContain('"count":1');

    controller.abort();
    await reader.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(roomHub.subscriberCount(roomId)).toBe(0);
  });
});
