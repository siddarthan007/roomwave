import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import type { Activity, CreateActivityInput, ResponsePayload, RoomState } from "@roomwave/shared";
import { activityRequiresReveal } from "@roomwave/shared";

import { db } from "../db";
import { rooms } from "../db/schema";
import { app } from "../index";

let cleanupRoomId = "";

afterEach(() => {
  if (cleanupRoomId) db.delete(rooms).where(eq(rooms.id, cleanupRoomId)).run();
  cleanupRoomId = "";
});

async function body<T>(response: Response) {
  return (await response.json()) as T;
}

describe("signature mode lifecycle", () => {
  test("all five modes create, redact, accept, close correctly, and end through public routes", async () => {
    const created = await body<{
      room: { id: string; code: string };
      hostToken: string;
    }>(
      await app.request(
        "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Signature integration" }),
        },
        { remoteAddress: "198.51.100.70" },
      ),
    );
    cleanupRoomId = created.room.id;
    const participant = await body<{ token: string }>(
      await app.request(
        `/api/rooms/${created.room.code}/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: "Mode Tester", avatarSeed: "mode-tester" }),
        },
        { remoteAddress: "198.51.100.71" },
      ),
    );
    const hostHeaders = {
      Authorization: `Bearer ${created.hostToken}`,
      "Content-Type": "application/json",
    };
    const participantHeaders = {
      Authorization: `Bearer ${participant.token}`,
      "Content-Type": "application/json",
    };

    const cases: Array<{
      create: CreateActivityInput;
      response: (activity: Activity) => ResponsePayload;
      assertHidden?: (state: RoomState) => void;
    }> = [
      {
        create: {
          type: "reality-bender",
          prompt: "What does the room believe?",
          lowLabel: "Disagree",
          highLabel: "Agree",
          resultsMode: "blind",
        },
        response: () => ({ type: "reality-bender", personal: 400, roomEstimate: 700 }),
      },
      {
        create: {
          type: "living-consensus",
          prompt: "How optimistic are you?",
          lowLabel: "Low",
          highLabel: "High",
          resultsMode: "live",
        },
        response: () => ({ type: "living-consensus", value: 650, confidence: 80 }),
      },
      {
        create: {
          type: "future-fork",
          prompt: "What happens next?",
          branches: ["Open access", "Tight controls"],
          evidenceDrop: "Retention fell after six months.",
          resultsMode: "blind",
        },
        response: (activity) => {
          if (activity.config.type !== "future-fork") throw new Error("Config mismatch");
          return {
            type: "future-fork",
            beforeBranchId: activity.config.branches[0].id,
            beforeLikelihood: 70,
            afterBranchId: activity.config.branches[1].id,
            afterLikelihood: 80,
          };
        },
      },
      {
        create: {
          type: "cipher-room",
          prompt: "Find the Caesar shift",
          ciphertext: "WKLV LV D WHVW",
          clue: "Rotate backward",
          correctShift: 3,
          timeLimitSeconds: 45,
          resultsMode: "blind",
        },
        response: () => ({ type: "cipher-room", shift: 3, confidence: 90 }),
        assertHidden: (state) => {
          expect(state.activity?.config.type).toBe("cipher-room");
          if (state.activity?.config.type === "cipher-room") {
            expect(state.activity.config.correctShift).toBeNull();
          }
        },
      },
      {
        create: {
          type: "shadow-council",
          prompt: "Who manipulated the mission?",
          aliases: ["Vector", "Moth", "Tide"],
          shadowAliasIndex: 1,
          evidence: "One Shadow backed the Foundry.",
          timeLimitSeconds: 60,
          resultsMode: "blind",
        },
        response: (activity) => {
          if (activity.config.type !== "shadow-council") throw new Error("Config mismatch");
          return {
            type: "shadow-council",
            allocations: [{ aliasId: activity.config.aliases[1].id, points: 3 }],
            banishId: activity.config.aliases[1].id,
            confidence: 85,
          };
        },
        assertHidden: (state) => {
          expect(state.activity?.config.type).toBe("shadow-council");
          if (state.activity?.config.type === "shadow-council") {
            expect(state.activity.config.shadowAliasId).toBeNull();
          }
        },
      },
    ];

    for (const scenario of cases) {
      const activityResponse = await app.request(
        `/api/rooms/${created.room.id}/activities`,
        {
          method: "POST",
          headers: hostHeaders,
          body: JSON.stringify(scenario.create),
        },
      );
      expect(activityResponse.status).toBe(201);
      const activity = await body<Activity>(activityResponse);

      expect(
        (
          await app.request(`/api/activities/${activity.id}/start`, {
            method: "POST",
            headers: hostHeaders,
          })
        ).status,
      ).toBe(200);

      const hidden = await body<RoomState>(
        await app.request(`/api/rooms/${created.room.id}/state`),
      );
      if (scenario.create.resultsMode === "blind") expect(hidden.aggregate).toBeNull();
      scenario.assertHidden?.(hidden);

      const submitted = await app.request(`/api/activities/${activity.id}/responses`, {
        method: "POST",
        headers: participantHeaders,
        body: JSON.stringify(scenario.response(activity)),
      });
      expect(submitted.status).toBe(200);

      expect(
        (
          await app.request(`/api/activities/${activity.id}/lock`, {
            method: "POST",
            headers: hostHeaders,
          })
        ).status,
      ).toBe(200);
      const reveal = await app.request(`/api/activities/${activity.id}/reveal`, {
        method: "POST",
        headers: hostHeaders,
      });
      expect(reveal.status).toBe(
        activityRequiresReveal(activity.config) ? 200 : 409,
      );

      const revealed = await body<RoomState>(
        await app.request(`/api/rooms/${created.room.id}/state`),
      );
      expect(revealed.aggregate?.type).toBe(scenario.create.type);

      expect(
        (
          await app.request(`/api/activities/${activity.id}/end`, {
            method: "POST",
            headers: hostHeaders,
          })
        ).status,
      ).toBe(200);
    }
  });
});
