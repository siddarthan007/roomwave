import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import type { Activity, CreateActivityInput, RoomState } from "@roomwave/shared";

import { db } from "../db";
import { rooms } from "../db/schema";
import { app } from "../index";

let cleanupRoomId = "";

afterEach(() => {
  if (cleanupRoomId) db.delete(rooms).where(eq(rooms.id, cleanupRoomId)).run();
  cleanupRoomId = "";
});

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("route reveal policy", () => {
  test("live rounds finish on lock while blind and truth rounds retain reveal", async () => {
    const created = await body<{
      room: { id: string };
      hostToken: string;
    }>(
      await app.request(
        "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Reveal policy" }),
        },
        { remoteAddress: "198.51.100.90" },
      ),
    );
    cleanupRoomId = created.room.id;

    const headers = {
      Authorization: `Bearer ${created.hostToken}`,
      "Content-Type": "application/json",
    };
    const cases: Array<{
      create: CreateActivityInput;
      revealStatus: 200 | 409;
      finalState: "locked" | "revealed";
    }> = [
      {
        create: {
          type: "pulse-choice",
          prompt: "Choose now",
          options: ["North", "South"],
          choiceRule: "majority",
          resultsMode: "live",
        },
        revealStatus: 409,
        finalState: "locked",
      },
      {
        create: {
          type: "pulse-choice",
          prompt: "Choose in secret",
          options: ["North", "South"],
          choiceRule: "minority",
          resultsMode: "blind",
        },
        revealStatus: 200,
        finalState: "revealed",
      },
      {
        create: {
          type: "prediction",
          prompt: "How many?",
          unit: "people",
          min: 0,
          max: 100,
          answer: 42,
          resultsMode: "live",
        },
        revealStatus: 200,
        finalState: "revealed",
      },
    ];

    for (const scenario of cases) {
      const activityResponse = await app.request(
        `/api/rooms/${created.room.id}/activities`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(scenario.create),
        },
      );
      expect(activityResponse.status).toBe(201);
      const activity = await body<Activity>(activityResponse);

      expect(
        (
          await app.request(`/api/activities/${activity.id}/start`, {
            method: "POST",
            headers,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await app.request(`/api/activities/${activity.id}/lock`, {
            method: "POST",
            headers,
          })
        ).status,
      ).toBe(200);

      const reveal = await app.request(`/api/activities/${activity.id}/reveal`, {
        method: "POST",
        headers,
      });
      expect(reveal.status).toBe(scenario.revealStatus);
      if (scenario.revealStatus === 409) {
        expect(await body<{ error: { code: string } }>(reveal)).toEqual({
          error: expect.objectContaining({ code: "REVEAL_NOT_REQUIRED" }),
        });
      }

      const state = await body<RoomState>(
        await app.request(`/api/rooms/${created.room.id}/state`),
      );
      expect(state.activity?.state).toBe(scenario.finalState);
      expect(state.aggregate?.type).toBe(scenario.create.type);

      expect(
        (
          await app.request(`/api/activities/${activity.id}/end`, {
            method: "POST",
            headers,
          })
        ).status,
      ).toBe(200);
    }
  });

  test("always-live modes reject impossible blind configurations", async () => {
    const created = await body<{
      room: { id: string };
      hostToken: string;
    }>(
      await app.request(
        "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Always live policy" }),
        },
        { remoteAddress: "198.51.100.91" },
      ),
    );
    cleanupRoomId = created.room.id;
    const headers = {
      Authorization: `Bearer ${created.hostToken}`,
      "Content-Type": "application/json",
    };

    const impossible = [
      {
        type: "crowd-meter",
        prompt: "Make some noise",
        windowSeconds: 15,
        resultsMode: "blind",
      },
      {
        type: "question-board",
        prompt: "Ask the room",
        maxChars: 140,
        resultsMode: "blind",
      },
    ];

    for (const create of impossible) {
      const response = await app.request(
        `/api/rooms/${created.room.id}/activities`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(create),
        },
      );
      expect(response.status).toBe(400);
    }
  });
});
