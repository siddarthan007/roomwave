import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import type { Activity, RoomState } from "@roomwave/shared";

import { app } from "../index";
import { db } from "../db";
import { rooms } from "../db/schema";
import { resetRateLimitersForTests } from "../lib/rate-limit";

const HALL = 500;
const TEN_SECONDS_MS = 10_000;

let cleanupRoomId = "";

afterEach(() => {
  resetRateLimitersForTests();
  if (cleanupRoomId) db.delete(rooms).where(eq(rooms.id, cleanupRoomId)).run();
  cleanupRoomId = "";
});

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("hall burst live votes", () => {
  test("forged votes without a seat token are rejected", async () => {
    const created = await json<{
      room: { id: string; code: string };
      hostToken: string;
    }>(
      await app.request("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Auth room" }),
      }),
    );
    cleanupRoomId = created.room.id;

    const activity = await json<Activity>(
      await app.request(`/api/rooms/${created.room.id}/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${created.hostToken}`,
        },
        body: JSON.stringify({
          type: "pulse-choice",
          prompt: "Pick",
          options: ["Yes", "No"],
          resultsMode: "live",
        }),
      }),
    );
    await app.request(`/api/activities/${activity.id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${created.hostToken}` },
    });
    expect(activity.config.type).toBe("pulse-choice");
    if (activity.config.type !== "pulse-choice") return;

    const payload = {
      type: "pulse-choice",
      optionId: activity.config.options[0].id,
    };
    const unauthenticated = await app.request(
      `/api/activities/${activity.id}/responses`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(unauthenticated.status).toBe(401);

    const forged = await app.request(`/api/activities/${activity.id}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer not-a-real-seat-token",
      },
      body: JSON.stringify(payload),
    });
    expect(forged.status).toBe(401);
  });

  test("500 players join and vote together within 10 seconds", async () => {
    const created = await json<{
      room: { id: string; code: string };
      hostToken: string;
    }>(
      await app.request("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hall burst" }),
      }),
    );
    cleanupRoomId = created.room.id;
    const hostHeaders = { Authorization: `Bearer ${created.hostToken}` };

    const activity = await json<Activity>(
      await app.request(`/api/rooms/${created.room.id}/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...hostHeaders,
        },
        body: JSON.stringify({
          type: "pulse-choice",
          prompt: "Ready?",
          options: ["Go", "Wait"],
          resultsMode: "live",
        }),
      }),
    );
    expect(activity.config.type).toBe("pulse-choice");
    if (activity.config.type !== "pulse-choice") return;
    const optionId = activity.config.options[0].id;

    expect(
      (
        await app.request(`/api/activities/${activity.id}/start`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);

    const stream = await app.request(`/api/rooms/${created.room.id}/events`);
    expect(stream.status).toBe(200);
    const reader = stream.body!.getReader();
    let liveTotal = 0;
    const watch = (async () => {
      const decoder = new TextDecoder();
      while (liveTotal < HALL) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const text = decoder.decode(chunk.value);
        const match = text.match(/"total":(\d+)/);
        if (match) liveTotal = Math.max(liveTotal, Number(match[1]));
      }
    })();

    const started = performance.now();

    const joins = await Promise.all(
      Array.from({ length: HALL }, (_, index) =>
        app.request(`/api/rooms/${created.room.code}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatarSeed: `hall-${index}` }),
        }),
      ),
    );
    expect(joins.every((response) => response.status === 200)).toBe(true);
    const tokens = await Promise.all(
      joins.map(async (response) => (await json<{ token: string }>(response)).token),
    );

    const votes = await Promise.all(
      tokens.map((token) =>
        app.request(`/api/activities/${activity.id}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: "pulse-choice", optionId }),
        }),
      ),
    );
    const elapsed = performance.now() - started;
    expect(votes.filter((response) => response.status === 200)).toHaveLength(HALL);
    expect(elapsed).toBeLessThan(TEN_SECONDS_MS);

    await Promise.race([
      watch,
      Bun.sleep(1_500).then(() => undefined),
    ]);
    await reader.cancel().catch(() => undefined);

    const state = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(state.participantCount).toBe(HALL);
    expect(state.responseCount).toBe(HALL);
    expect(state.aggregate?.type).toBe("pulse-choice");
    if (state.aggregate?.type === "pulse-choice") {
      expect(state.aggregate.total).toBe(HALL);
      expect(state.aggregate.options[0]?.count).toBe(HALL);
    }
    expect(liveTotal).toBe(HALL);
  }, { timeout: 20_000 });
});
