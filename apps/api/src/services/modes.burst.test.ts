import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { activities, participants, responses, rooms } from "../db/schema";
import { aggregateActivity } from "./modes";

let roomId = "";

afterEach(() => {
  if (roomId) db.delete(rooms).where(eq(rooms.id, roomId)).run();
  roomId = "";
});

describe("poll burst integrity", () => {
  test("1,000 logical participants aggregate exactly into one bounded result", () => {
    roomId = crypto.randomUUID();
    const activityId = crypto.randomUUID();
    const now = new Date().toISOString();
    const firstOption = crypto.randomUUID();
    const secondOption = crypto.randomUUID();
    const config = {
      type: "pulse-choice" as const,
      options: [
        { id: firstOption, label: "Ship" },
        { id: secondOption, label: "Hold" },
      ],
      resultsMode: "live" as const,
      choiceRule: "majority" as const,
    };

    db.insert(rooms).values({
      id: roomId,
      code: `L${roomId.slice(0, 5).toUpperCase()}`,
      title: "Burst room",
      hostTokenHash: "host",
      status: "live",
      activeActivityId: activityId,
      createdAt: now,
    }).run();
    db.insert(activities).values({
      id: activityId,
      roomId,
      type: "pulse-choice",
      prompt: "Ready?",
      state: "live",
      config,
      createdAt: now,
    }).run();

    const participantRows = Array.from({ length: 1_000 }, () => ({
      id: crypto.randomUUID(),
      roomId,
      tokenHash: crypto.randomUUID(),
      joinedAt: now,
    }));
    db.insert(participants).values(participantRows).run();
    db.insert(responses)
      .values(
        participantRows.map((participant, index) => ({
          id: crypto.randomUUID(),
          activityId,
          participantId: participant.id,
          payload: {
            type: "pulse-choice" as const,
            optionId: index < 625 ? firstOption : secondOption,
          },
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();

    const aggregate = aggregateActivity({
      id: activityId,
      type: "pulse-choice",
      state: "live",
      config,
    });
    expect(aggregate.type).toBe("pulse-choice");
    if (aggregate.type === "pulse-choice") {
      expect(aggregate.total).toBe(1_000);
      expect(aggregate.options.map((option) => option.count)).toEqual([625, 375]);
      expect(aggregate.options.map((option) => option.percentage)).toEqual([
        62.5,
        37.5,
      ]);
      expect(JSON.stringify(aggregate).length).toBeLessThan(2_000);
    }
  });
});
