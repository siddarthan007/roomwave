import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import type { RoomSettings } from "@roomwave/shared";

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

describe("room settings patch", () => {
  test("partial update merges over stored settings instead of resetting them", async () => {
    const created = await body<{
      room: { id: string };
      hostToken: string;
    }>(
      await app.request(
        "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Settings merge",
            settings: {
              theme: "midnight",
              lobbyMessage: "custom lobby text",
              maxParticipants: 42,
            },
          }),
        },
        { remoteAddress: "198.51.100.70" },
      ),
    );
    cleanupRoomId = created.room.id;

    const headers = {
      Authorization: `Bearer ${created.hostToken}`,
      "Content-Type": "application/json",
    };

    // Toggle one field only.
    const patched = await body<{ settings: RoomSettings }>(
      await app.request(`/api/rooms/${created.room.id}/settings`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ allowReactions: false }),
      }),
    );

    expect(patched.settings.allowReactions).toBe(false);
    // Omitted fields keep their stored values; they must not fall back to defaults.
    expect(patched.settings.theme).toBe("midnight");
    expect(patched.settings.lobbyMessage).toBe("custom lobby text");
    expect(patched.settings.maxParticipants).toBe(42);

    const state = await body<{ room: { settings: RoomSettings } }>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(state.room.settings.theme).toBe("midnight");
    expect(state.room.settings.maxParticipants).toBe(42);
  });

  test("empty object is a no-op rather than a reset to defaults", async () => {
    const created = await body<{
      room: { id: string };
      hostToken: string;
    }>(
      await app.request(
        "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Settings no-op",
            settings: { theme: "signal", showPresence: false },
          }),
        },
        { remoteAddress: "198.51.100.71" },
      ),
    );
    cleanupRoomId = created.room.id;

    const response = await app.request(`/api/rooms/${created.room.id}/settings`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${created.hostToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(200);

    const state = await body<{ room: { settings: RoomSettings } }>(
      await app.request(`/api/rooms/${created.room.id}/state`),
    );
    expect(state.room.settings.theme).toBe("signal");
    expect(state.room.settings.showPresence).toBe(false);
  });

  test("invalid field values are still rejected", async () => {
    const created = await body<{
      room: { id: string };
      hostToken: string;
    }>(
      await app.request(
        "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Settings invalid" }),
        },
        { remoteAddress: "198.51.100.72" },
      ),
    );
    cleanupRoomId = created.room.id;

    const response = await app.request(`/api/rooms/${created.room.id}/settings`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${created.hostToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme: "not-a-theme", maxParticipants: -5 }),
    });
    expect(response.status).toBe(400);
  });
});
