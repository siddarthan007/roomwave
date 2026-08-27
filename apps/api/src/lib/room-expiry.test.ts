import { afterEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { app } from "../index";
import { db } from "../db";
import { activities, participants, responses, rooms } from "../db/schema";
import {
  expireStaleRooms,
  isRoomExpired,
  ROOM_TTL_MS,
} from "./room-expiry";

let cleanupRoomId = "";

afterEach(() => {
  if (cleanupRoomId) db.delete(rooms).where(eq(rooms.id, cleanupRoomId)).run();
  cleanupRoomId = "";
});

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createRoom(title: string, peer: string) {
  const response = await app.request(
    "/api/rooms",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
    { remoteAddress: peer },
  );
  expect(response.status).toBe(201);
  const created = await json<{
    room: { id: string; code: string; createdAt: string };
    hostToken: string;
  }>(response);
  cleanupRoomId = created.room.id;
  return created;
}

function backdateRoomTree(
  roomId: string,
  iso: string,
  options: { responses?: string } = {},
) {
  db.update(rooms).set({ createdAt: iso }).where(eq(rooms.id, roomId)).run();
  db.update(activities)
    .set({ createdAt: iso })
    .where(eq(activities.roomId, roomId))
    .run();
  db.update(participants)
    .set({ joinedAt: iso })
    .where(eq(participants.roomId, roomId))
    .run();
  const activityIds = db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.roomId, roomId))
    .all()
    .map(({ id }) => id);
  if (activityIds.length === 0) return;
  const responseAt = options.responses ?? iso;
  db.update(responses)
    .set({ createdAt: responseAt, updatedAt: responseAt })
    .where(inArray(responses.activityId, activityIds))
    .run();
}

describe("room idle expiry", () => {
  test("deletes a room that has been quiet longer than 24 hours", async () => {
    const created = await createRoom("Idle purge", "198.51.100.10");
    const stale = new Date(Date.now() - ROOM_TTL_MS - 60_000).toISOString();
    backdateRoomTree(created.room.id, stale);
    expect(
      isRoomExpired({ id: created.room.id, createdAt: stale }),
    ).toBe(true);

    expireStaleRooms(Date.now(), { force: true });

    expect(
      db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, created.room.id)).get(),
    ).toBeUndefined();
    const join = await app.request(`/api/rooms/${created.room.code}/join`, {
      method: "POST",
    });
    expect(join.status).toBe(404);
    cleanupRoomId = "";
  });

  test("keeps a room whose last response is still inside the idle window", async () => {
    const created = await createRoom("Active keep", "198.51.100.11");
    const joined = await json<{ token: string }>(
      await app.request(`/api/rooms/${created.room.code}/join`, {
        method: "POST",
      }),
    );
    const hostHeaders = { Authorization: `Bearer ${created.hostToken}` };
    const activityResponse = await app.request(
      `/api/rooms/${created.room.id}/activities`,
      {
        method: "POST",
        headers: { ...hostHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pulse-choice",
          prompt: "Stay?",
          options: ["Yes", "No"],
          resultsMode: "live",
        }),
      },
    );
    expect(activityResponse.status).toBe(201);
    const activity = await json<{
      id: string;
      config: { type: string; options: Array<{ id: string }> };
    }>(activityResponse);
    expect(
      (
        await app.request(`/api/activities/${activity.id}/start`, {
          method: "POST",
          headers: hostHeaders,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/api/activities/${activity.id}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${joined.token}`,
          },
          body: JSON.stringify({
            type: "pulse-choice",
            optionId: activity.config.options[0].id,
          }),
        })
      ).status,
    ).toBe(200);

    const stale = new Date(Date.now() - ROOM_TTL_MS - 60_000).toISOString();
    const recent = new Date().toISOString();
    backdateRoomTree(created.room.id, stale, { responses: recent });

    const room = db
      .select({ id: rooms.id, createdAt: rooms.createdAt })
      .from(rooms)
      .where(eq(rooms.id, created.room.id))
      .get();
    expect(room).toBeDefined();
    expect(isRoomExpired(room!)).toBe(false);

    expireStaleRooms(Date.now(), { force: true });

    expect(
      db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, created.room.id)).get()?.id,
    ).toBe(created.room.id);
  });

  test("treats an invalid createdAt as expired", () => {
    expect(isRoomExpired({ id: "missing", createdAt: "not-a-date" })).toBe(true);
  });
});
