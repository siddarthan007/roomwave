import { afterEach, describe, expect, test } from "bun:test";
import { and, count, eq, inArray } from "drizzle-orm";

import type { Activity, RoomState } from "@roomwave/shared";

import { app } from "../index";
import { findWritableResponseActivity } from "./activities";
import { db } from "../db";
import { activities, participants, responses, rooms } from "../db/schema";

let cleanupRoomId = "";

afterEach(() => {
  if (cleanupRoomId) db.delete(rooms).where(eq(rooms.id, cleanupRoomId)).run();
  cleanupRoomId = "";
});

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("release hardening", () => {
  test("rejects oversized API bodies before route parsing", async () => {
    const response = await app.request("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(40_000) }),
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("allows only configured cross-origin web clients", async () => {
    const allowed = await app.request("/api/health", {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );

    const blocked = await app.request("/api/health", {
      headers: { Origin: "https://untrusted.example" },
    });
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("preserves one-round, lock, moderation, count, quota and expiry invariants", async () => {
    const createdResponse = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hardening room" }),
      },
      { remoteAddress: "203.0.113.20" },
    );
    expect(createdResponse.status).toBe(201);
    const created = await json<{
      room: { id: string; code: string };
      hostToken: string;
    }>(createdResponse);
    cleanupRoomId = created.room.id;
    const hostHeaders = { Authorization: `Bearer ${created.hostToken}` };

    const joined = await json<{ token: string }>(
      await app.request(
        `/api/rooms/${created.room.code}/join`,
        { method: "POST" },
        { remoteAddress: "203.0.113.21" },
      ),
    );

    const activityPayload = {
      type: "pulse-choice",
      prompt: "Pick one",
      options: ["A", "B"],
      resultsMode: "live",
      choiceRule: "majority",
    };
    const firstActivityResponse = await app.request(
      `/api/rooms/${created.room.id}/activities`,
      {
        method: "POST",
        headers: { ...hostHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(activityPayload),
      },
    );
    expect(firstActivityResponse.status).toBe(201);
    const firstActivity = await json<Activity>(firstActivityResponse);

    const duplicateDraft = await app.request(
      `/api/rooms/${created.room.id}/activities`,
      {
        method: "POST",
        headers: { ...hostHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(activityPayload),
      },
    );
    expect(duplicateDraft.status).toBe(409);

    expect(
      (
        await app.request(`/api/activities/${firstActivity.id}/start`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);

    if (firstActivity.config.type !== "pulse-choice") return;
    const bodyText = JSON.stringify({
      type: "pulse-choice",
      optionId: firstActivity.config.options[0].id,
    });
    const encoder = new TextEncoder();
    let releaseBody: (() => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const midpoint = Math.floor(bodyText.length / 2);
        controller.enqueue(encoder.encode(bodyText.slice(0, midpoint)));
        releaseBody = () => {
          controller.enqueue(encoder.encode(bodyText.slice(midpoint)));
          controller.close();
        };
      },
    });
    const delayedRequest = new Request(
      `http://localhost/api/activities/${firstActivity.id}/responses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${joined.token}`,
        },
        body,
        duplex: "half",
      } as RequestInit,
    );
    const delayedResponse = app.request(delayedRequest);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      (
        await app.request(`/api/activities/${firstActivity.id}/lock`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);
    releaseBody?.();
    expect((await delayedResponse).status).toBe(409);
    expect(
      db
        .select({ value: count() })
        .from(responses)
        .where(eq(responses.activityId, firstActivity.id))
        .get()?.value,
    ).toBe(0);

    expect(
      (
        await app.request(`/api/activities/${firstActivity.id}/reset`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);
    const epochBeforeReset = db
      .select({ value: activities.responseEpoch })
      .from(activities)
      .where(eq(activities.id, firstActivity.id))
      .get()?.value;
    expect(epochBeforeReset).toBe(1);
    expect(
      (
        await app.request(`/api/activities/${firstActivity.id}/reset`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);
    expect(
      findWritableResponseActivity(firstActivity.id, epochBeforeReset ?? -1),
    ).toBeNull();
    expect(
      db
        .select({ value: count() })
        .from(responses)
        .where(eq(responses.activityId, firstActivity.id))
        .get()?.value,
    ).toBe(0);

    expect(
      (
        await app.request(`/api/activities/${firstActivity.id}/end`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);

    const board = await json<Activity>(
      await app.request(`/api/rooms/${created.room.id}/activities`, {
        method: "POST",
        headers: { ...hostHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "question-board",
          prompt: "What matters?",
          maxChars: 140,
          resultsMode: "live",
          moderationMode: "review",
        }),
      }),
    );
    expect(
      (
        await app.request(`/api/activities/${board.id}/start`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);

    const submitQuestion = (index: number) =>
      app.request(`/api/activities/${board.id}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${joined.token}`,
        },
        body: JSON.stringify({
          type: "question-board",
          action: "submit",
          question: `Question ${index}?`,
        }),
      });
    for (let index = 1; index <= 5; index += 1) {
      expect((await submitQuestion(index)).status).toBe(200);
    }
    expect((await submitQuestion(6)).status).toBe(429);

    let state = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(state.responseCount).toBe(0);
    expect(state.aggregate?.type).toBe("question-board");
    if (state.aggregate?.type === "question-board") {
      expect(state.aggregate.total).toBe(0);
    }

    const queue = await json<{
      items: Array<{ id: string; status: string }>;
    }>(
      await app.request(`/api/activities/${board.id}/moderation`, {
        headers: hostHeaders,
      }),
    );
    expect(queue.items).toHaveLength(5);
    expect(queue.items.every((item) => item.status === "pending")).toBe(true);
    const firstQuestionId = queue.items[0].id;
    expect(
      (
        await app.request(
          `/api/activities/${board.id}/moderation/${firstQuestionId}`,
          {
            method: "PATCH",
            headers: { ...hostHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "visible" }),
          },
        )
      ).status,
    ).toBe(200);
    state = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(state.responseCount).toBe(1);

    expect(
      (
        await app.request(`/api/activities/${board.id}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${joined.token}`,
          },
          body: JSON.stringify({
            type: "question-board",
            action: "upvote",
            questionId: firstQuestionId,
          }),
        })
      ).status,
    ).toBe(200);
    state = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(state.responseCount).toBe(1);

    await app.request(
      `/api/activities/${board.id}/moderation/${firstQuestionId}`,
      {
        method: "PATCH",
        headers: { ...hostHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "hidden" }),
      },
    );
    state = await json<RoomState>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(state.responseCount).toBe(0);

    const stale = new Date(Date.now() - 25 * 60 * 60 * 1_000).toISOString();
    db.update(rooms)
      .set({ createdAt: stale })
      .where(eq(rooms.id, created.room.id))
      .run();
    db.update(activities)
      .set({ createdAt: stale })
      .where(eq(activities.roomId, created.room.id))
      .run();
    db.update(participants)
      .set({ joinedAt: stale })
      .where(eq(participants.roomId, created.room.id))
      .run();
    const staleActivityIds = db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.roomId, created.room.id))
      .all()
      .map(({ id }) => id);
    if (staleActivityIds.length > 0) {
      db.update(responses)
        .set({ createdAt: stale, updatedAt: stale })
        .where(inArray(responses.activityId, staleActivityIds))
        .run();
    }
    const expiredReset = await app.request(
      `/api/activities/${board.id}/reset`,
      { method: "POST", headers: hostHeaders },
    );
    expect(expiredReset.status).toBe(409);
    expect(
      db
        .select({ status: rooms.status })
        .from(rooms)
        .where(eq(rooms.id, created.room.id))
        .get()?.status,
    ).toBe("ended");

    expect(
      db
        .select({ value: count() })
        .from(activities)
        .where(
          and(
            eq(activities.roomId, created.room.id),
            eq(activities.state, "live"),
          ),
        )
        .get()?.value,
    ).toBe(0);
  });
});
