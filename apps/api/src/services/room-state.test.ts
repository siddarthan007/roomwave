import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { activities, participants, responses, rooms } from "../db/schema";
import { calculateMomentum, getRoomState } from "./room-state";

let roomId = "";

afterEach(() => {
  if (roomId) db.delete(rooms).where(eq(rooms.id, roomId)).run();
  roomId = "";
});

describe("public room state", () => {
  test("redacts blind aggregates and prediction truth until reveal", () => {
    roomId = crypto.randomUUID();
    const activityId = crypto.randomUUID();
    const participantId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(rooms).values({
      id: roomId,
      code: `B${roomId.slice(0, 5).toUpperCase()}`,
      title: "Blind room",
      hostTokenHash: "host",
      status: "live",
      activeActivityId: activityId,
      createdAt: now,
    }).run();
    db.insert(activities).values({
      id: activityId,
      roomId,
      type: "prediction",
      prompt: "Guess",
      state: "locked",
      config: {
        type: "prediction",
        unit: "%",
        min: 0,
        max: 100,
        answer: 42,
        resultsMode: "blind",
      },
      createdAt: now,
    }).run();
    db.insert(participants).values({
      id: participantId,
      roomId,
      tokenHash: crypto.randomUUID(),
      joinedAt: now,
    }).run();
    db.insert(responses).values({
      id: crypto.randomUUID(),
      activityId,
      participantId,
      payload: { type: "prediction", value: 40 },
      createdAt: now,
      updatedAt: now,
    }).run();

    const locked = getRoomState(roomId)!;
    expect(locked.aggregate).toBeNull();
    expect(locked.responseCount).toBe(1);
    expect(locked.participantCount).toBe(1);
    expect(locked.activity?.config.type).toBe("prediction");
    if (locked.activity?.config.type === "prediction") {
      expect(locked.activity.config.answer).toBeNull();
    }

    db.update(activities)
      .set({ state: "revealed" })
      .where(eq(activities.id, activityId))
      .run();
    const revealed = getRoomState(roomId)!;
    expect(revealed.aggregate?.type).toBe("prediction");
    if (revealed.aggregate?.type === "prediction") {
      expect(revealed.aggregate.answer).toBe(42);
      expect(revealed.aggregate.total).toBe(1);
    }
  });
});

describe("momentum windows", () => {
  test("compares the latest five seconds with the preceding five", () => {
    const now = Date.parse("2026-01-01T00:00:10.000Z");
    const momentum = calculateMomentum(
      [
        "2026-01-01T00:00:09.000Z",
        "2026-01-01T00:00:08.000Z",
        "2026-01-01T00:00:04.000Z",
      ],
      now,
    );
    expect(momentum.recentRate).toBe(0.4);
    expect(momentum.previousRate).toBe(0.2);
    expect(momentum.trend).toBe("steady");
  });
});
