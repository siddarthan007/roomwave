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

function seedRoom(): string {
  const id = crypto.randomUUID();
  db.insert(rooms)
    .values({
      id,
      code: `S${id.slice(0, 5).toUpperCase()}`,
      title: "Replay room",
      hostTokenHash: "host",
      status: "lobby",
      activeActivityId: null,
      createdAt: new Date().toISOString(),
    })
    .run();
  return id;
}

// Minimal structural type: response.body readers vary across TS lib versions.
type StreamReader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
};

async function readChunk(reader: StreamReader): Promise<string> {
  const result = (await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("stream read timed out")), 2_000),
    ),
  ])) as { done: boolean; value?: Uint8Array };
  return new TextDecoder().decode(result.value);
}

describe("event replay", () => {
  test("reconnecting with after= replays missed events after the snapshot", async () => {
    roomId = seedRoom();

    // A listener consumes two live events (advancing the sequence), then dies.
    roomHub.subscribe(roomId, () => {});
    roomHub.publish(roomId, { type: "participant.count", roomId, count: 1 });
    const seqAfterOne = roomHub.publish(roomId, {
      type: "participant.count",
      roomId,
      count: 2,
    });
    expect(seqAfterOne).toBeGreaterThanOrEqual(2);

    // Publish the event the reconnecting client must not miss.
    const missedSeq = roomHub.publish(roomId, {
      type: "participant.count",
      roomId,
      count: 3,
    });

    const response = await app.request(
      `/api/rooms/${roomId}/events?after=${seqAfterOne}`,
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();

    // Snapshot always arrives first…
    const first = await readChunk(reader);
    expect(first).toContain("event: room.snapshot");

    // …then the events newer than `after`.
    const second = await readChunk(reader);
    expect(second).toContain('"count":3');
    await reader.cancel().catch(() => undefined);
  });

  test("a gap older than the replay window yields snapshot only", async () => {
    roomId = seedRoom();

    const response = await app.request("/api/rooms/".concat(roomId, "/events?after=1"));
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const first = await readChunk(reader);
    expect(first).toContain("event: room.snapshot");
    await reader.cancel().catch(() => undefined);
  });

  test("every event carries a monotonic numeric id", async () => {
    roomId = seedRoom();
    const controller = new AbortController();
    const response = await app.request(`/api/rooms/${roomId}/events`, {
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    const first = await readChunk(reader);
    const idLine = first.split("\n").find((line) => line.startsWith("id: "));
    expect(idLine).toBeDefined();
    expect(Number.parseInt(idLine!.slice(4), 10)).not.toBeNaN();

    roomHub.publish(roomId, { type: "participant.count", roomId, count: 7 });
    const second = await readChunk(reader);
    const secondId = Number.parseInt(
      second.split("\n").find((line) => line.startsWith("id: "))!.slice(4),
      10,
    );
    expect(secondId).toBeGreaterThan(Number.parseInt(idLine!.slice(4), 10));
    controller.abort();
    await reader.cancel().catch(() => undefined);
  });
});
