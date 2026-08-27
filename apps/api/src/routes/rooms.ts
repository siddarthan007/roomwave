import { Hono } from "hono";
import { and, count, eq, ne } from "drizzle-orm";

import {
  createRoomSchema,
  generatedRoomName,
  joinRoomSchema,
  updateRoomSettingsSchema,
} from "@roomwave/shared";
import type { RoomSettings } from "@roomwave/shared";

import {
  roomCreateLimiter,
  globalRoomCreateLimiter,
  joinLimiter,
  joinAttemptLimiter,
  globalJoinAttemptLimiter,
  publicReadLimiter,
  presenceLimiter,
  hostCommandLimiter,
} from "../lib/rate-limit";
import type { AppEnv } from "../lib/app-env";
import { remoteClientKey } from "../lib/app-env";
import {
  endExpiredRoom,
  expireStaleRooms,
  isRoomExpired,
} from "../lib/room-expiry";

import { db } from "../db";
import {
  activities,
  participants,
  rooms,
} from "../db/schema";

import {
  findParticipantByToken,
  getBearerToken,
  isHostAuthorized,
} from "../lib/auth";

import { createUniqueRoomCode } from "../lib/room-code";
import {
  createToken,
  hashToken,
} from "../lib/tokens";

import { getRoomState } from "../services/room-state";
import { roomHub } from "../realtime/room-hub";
import { presenceHub } from "../realtime/presence-hub";
import {
  buildActivityConfig,
  listModes,
} from "../services/modes";

export const roomRoutes = new Hono<AppEnv>();

roomRoutes.post(
  "/",
  async (c) => {
    if (
      !roomCreateLimiter.allow(remoteClientKey(c)) ||
      !globalRoomCreateLimiter.allow("global")
    ) {
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many rooms created. Try again shortly.",
          },
        },
        429,
      );
    }

    // Lazy expiration sweep: old rooms stop accepting joins and activities.
    expireStaleRooms();

    const json =
      await c.req
        .json()
        .catch(() => null);

    const result =
      createRoomSchema.safeParse(
        json,
      );

    if (!result.success) {
      return c.json(
        {
          error: {
            code:
              "INVALID_ROOM",
            message:
              result.error.issues[0]
                ?.message ??
              "Invalid room",
          },
        },
        400,
      );
    }

    const id =
      crypto.randomUUID();

    const code =
      createUniqueRoomCode();

    const hostToken =
      createToken();

    const hostTokenHash =
      await hashToken(
        hostToken,
      );

    const createdAt =
      new Date().toISOString();

    db.insert(rooms)
      .values({
        id,
        code,
        title:
          result.data.title,

        hostTokenHash,

        status: "lobby",
        activeActivityId:
          null,

        settings: result.data.settings,

        createdAt,
      })
      .run();

    return c.json(
      {
        room: {
          id,
          code,

          title:
            result.data.title,

          status:
            "lobby" as const,

          activeActivityId:
            null,

          settings: result.data.settings,

          createdAt,
        },

        hostToken,
      },
      201,
    );
  },
);

roomRoutes.post(
  "/:code/join",
  async (c) => {
    const peer = remoteClientKey(c);
    if (
      !joinAttemptLimiter.allow(peer) ||
      !globalJoinAttemptLimiter.allow("global")
    ) {
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many join attempts. Try again shortly.",
          },
        },
        429,
      );
    }
    expireStaleRooms();

    const code =
      c.req
        .param("code")
        .trim()
        .toUpperCase();

    const room = db
      .select()
      .from(rooms)
      .where(
        eq(
          rooms.code,
          code,
        ),
      )
      .get();

    if (!room) {
      return c.json(
        {
          error: {
            code:
              "ROOM_NOT_FOUND",
            message:
              "Room not found.",
          },
        },
        404,
      );
    }

    if (
      room.status === "ended"
    ) {
      return c.json(
        {
          error: {
            code:
              "ROOM_ENDED",
            message:
              "This room has ended.",
          },
        },
        409,
      );
    }

    if (!joinLimiter.allow(`${peer}:${room.id}`)) {
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many joins from this connection. Try again shortly.",
          },
        },
        429,
      );
    }

    if (room.status === "live" && !room.settings.allowLateJoin) {
      return c.json(
        { error: { code: "LATE_JOIN_CLOSED", message: "This round is closed to late arrivals." } },
        409,
      );
    }

    const joinJson = await c.req.json().catch(() => ({}));
    const joinInput = joinRoomSchema.safeParse(joinJson);
    if (!joinInput.success) {
      return c.json(
        {
          error: {
            code: "INVALID_PROFILE",
            message: joinInput.error.issues[0]?.message ?? "Invalid player profile.",
          },
        },
        400,
      );
    }

    const participantTotal =
      db
        .select({ value: count() })
        .from(participants)
        .where(eq(participants.roomId, room.id))
        .get()?.value ?? 0;
    if (participantTotal >= room.settings.maxParticipants) {
      return c.json(
        {
          error: {
            code: "ROOM_FULL",
            message: "This room has reached its participant capacity.",
          },
        },
        409,
      );
    }

    const participantId =
      crypto.randomUUID();

    const nameSeed = joinInput.data.avatarSeed ?? participantId;
    const displayName =
      room.settings.participantNames === "generated"
        ? generatedRoomName(nameSeed)
        : joinInput.data.displayName ?? generatedRoomName(nameSeed);
    const avatarSeed = joinInput.data.avatarSeed ?? crypto.randomUUID();

    const token =
      createToken();

    const tokenHash =
      await hashToken(token);

    // Token hashing yields to the event loop. Re-read durable state so an end
    // that landed meanwhile wins over this join.
    const joinableRoom = db
      .select()
      .from(rooms)
      .where(eq(rooms.id, room.id))
      .get();

    if (
      !joinableRoom ||
      joinableRoom.status === "ended" ||
      isRoomExpired(joinableRoom)
    ) {
      if (joinableRoom && joinableRoom.status !== "ended") {
        endExpiredRoom(joinableRoom.id);
      }
      return c.json(
        {
          error: {
            code: "ROOM_ENDED",
            message: "This room has ended.",
          },
        },
        409,
      );
    }

    if (joinableRoom.status === "live" && !joinableRoom.settings.allowLateJoin) {
      return c.json(
        { error: { code: "LATE_JOIN_CLOSED", message: "This round is closed to late arrivals." } },
        409,
      );
    }

    const currentParticipantTotal =
      db
        .select({ value: count() })
        .from(participants)
        .where(eq(participants.roomId, joinableRoom.id))
        .get()?.value ?? 0;
    if (currentParticipantTotal >= joinableRoom.settings.maxParticipants) {
      return c.json(
        { error: { code: "ROOM_FULL", message: "This room has reached its participant capacity." } },
        409,
      );
    }

    db.insert(participants)
      .values({
        id:
          participantId,

        roomId:
          joinableRoom.id,

        tokenHash,

        displayName,

        avatarSeed,

        joinedAt:
          new Date().toISOString(),
      })
      .run();

    // Join is a single discrete event; publish immediately so the new
    // player appears without waiting out the coalescing window.
    presenceHub.touch(
      joinableRoom.id,
      { id: participantId, displayName, avatarSeed },
      joinableRoom.settings.showPresence,
      Date.now(),
      { immediate: true },
    );

    const participantCount = getRoomState(joinableRoom.id)?.participantCount ?? 1;
    roomHub.publish(joinableRoom.id, {
      type: "participant.count",
      roomId: joinableRoom.id,
      count: participantCount,
    });

    return c.json({
      room: {
        id: joinableRoom.id,
        code: joinableRoom.code,
        title: joinableRoom.title,
        status: joinableRoom.status,

        activeActivityId:
          joinableRoom.activeActivityId,

        settings: joinableRoom.settings,

        createdAt:
          joinableRoom.createdAt,
      },

      participant: {
        id:
          participantId,
        displayName,
        avatarSeed,
      },

      token,
    });
  },
);

roomRoutes.patch("/:roomId/settings", async (c) => {
  const roomId = c.req.param("roomId");
  if (!hostCommandLimiter.allow(`host:${roomId}`)) {
    return c.json(
      { error: { code: "RATE_LIMITED", message: "Too many setting changes. Slow down." } },
      429,
    );
  }
  const token = getBearerToken(c.req.header("Authorization"));
  if (!token || !(await isHostAuthorized(roomId, token))) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid host token." } },
      401,
    );
  }

  const parsed = updateRoomSettingsSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_SETTINGS",
          message: parsed.error.issues[0]?.message ?? "Invalid room settings.",
        },
      },
      400,
    );
  }

  const stored = db
    .select({ settings: rooms.settings })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .get();
  if (!stored) {
    return c.json(
      { error: { code: "ROOM_NOT_FOUND", message: "Room not found or already ended." } },
      404,
    );
  }

  // Merge validated fields over stored settings: a partial PATCH must
  // never reset omitted fields to defaults.
  const mergedSettings: RoomSettings = { ...stored.settings, ...parsed.data };

  const updated = db
    .update(rooms)
    .set({ settings: mergedSettings })
    .where(and(eq(rooms.id, roomId), ne(rooms.status, "ended")))
    .returning({ id: rooms.id })
    .get();
  if (!updated) {
    return c.json(
      { error: { code: "ROOM_NOT_FOUND", message: "Room not found or already ended." } },
      404,
    );
  }

  const state = getRoomState(roomId);
  if (state) roomHub.publish(roomId, { type: "room.snapshot", state });
  return c.json({ settings: mergedSettings });
});

roomRoutes.post("/:roomId/presence", async (c) => {
  const roomId = c.req.param("roomId");
  if (!presenceLimiter.allow(`${remoteClientKey(c)}:${roomId}`)) {
    return c.json(
      { error: { code: "RATE_LIMITED", message: "Presence is already current." } },
      429,
    );
  }
  const token = getBearerToken(c.req.header("Authorization"));
  if (!token) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Participant token required." } },
      401,
    );
  }
  const participant = await findParticipantByToken(token);
  if (!participant || participant.roomId !== roomId) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid participant." } },
      401,
    );
  }
  const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get();
  if (!room || room.status === "ended" || isRoomExpired(room)) {
    return c.json(
      { error: { code: "ROOM_ENDED", message: "This room has ended." } },
      409,
    );
  }
  presenceHub.touch(
    roomId,
    {
      id: participant.id,
      displayName: participant.displayName,
      avatarSeed: participant.avatarSeed,
    },
    room.settings.showPresence,
  );
  return c.json({ success: true });
});

roomRoutes.get(
  "/:roomId/state",
  (c) => {
    if (!publicReadLimiter.allow(`${remoteClientKey(c)}:state:${c.req.param("roomId")}`)) {
      return c.json(
        { error: { code: "RATE_LIMITED", message: "Refresh again shortly." } },
        429,
      );
    }
    expireStaleRooms();
    const state =
      getRoomState(
        c.req.param("roomId"),
      );

    if (!state) {
      return c.json(
        {
          error: {
            code:
              "ROOM_NOT_FOUND",
            message:
              "Room not found.",
          },
        },
        404,
      );
    }

    return c.json(state);
  },
);

// Host: create an activity of any registered mode
roomRoutes.post(
  "/:roomId/activities",
  async (c) => {
    expireStaleRooms();
    const roomId =
      c.req.param("roomId");

    const token =
      getBearerToken(
        c.req.header(
          "Authorization",
        ),
      );

    if (
      !token ||
      !(await isHostAuthorized(
        roomId,
        token,
      ))
    ) {
      return c.json(
        {
          error: {
            code:
              "UNAUTHORIZED",
            message:
              "Invalid host token.",
          },
        },
        401,
      );
    }

    const room = db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .get();

    if (!room) {
      return c.json(
        {
          error: {
            code:
              "ROOM_NOT_FOUND",
            message:
              "Room not found.",
          },
        },
        404,
      );
    }

    if (room.status === "ended") {
      return c.json(
        {
          error: {
            code: "ROOM_ENDED",
            message: "This room has ended.",
          },
        },
        409,
      );
    }

    if (room.activeActivityId) {
      const active = db
        .select({ state: activities.state })
        .from(activities)
        .where(eq(activities.id, room.activeActivityId))
        .get();
      if (active && active.state !== "ended") {
        return c.json(
          {
            error: {
              code: "ACTIVITY_ACTIVE",
              message: "End the current round before creating another.",
            },
          },
          409,
        );
      }
    }

    const json =
      await c.req
        .json()
        .catch(() => null);

    const { validateCreateActivity } =
      await import("@roomwave/shared");

    const parsed =
      validateCreateActivity(json);

    if (!parsed.success) {
      return c.json(
        {
          error: {
            code:
              "INVALID_ACTIVITY",
            message:
              parsed.error.issues[0]
                ?.message ??
              "Invalid activity.",
          },
        },
        400,
      );
    }

    const config =
      buildActivityConfig(
        parsed.data,
      );

    // Authentication, body parsing and module loading all yield. The final
    // synchronous write boundary must be based on current room state.
    const currentRoom = db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .get();
    if (
      !currentRoom ||
      currentRoom.status === "ended" ||
      isRoomExpired(currentRoom)
    ) {
      return c.json(
        {
          error: {
            code: "ROOM_ENDED",
            message: "This room has ended.",
          },
        },
        409,
      );
    }

    const openActivity = db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.roomId, roomId),
          ne(activities.state, "ended"),
        ),
      )
      .get();
    if (openActivity) {
      return c.json(
        {
          error: {
            code: "ACTIVITY_ACTIVE",
            message: "End the current round before creating another.",
          },
        },
        409,
      );
    }

    const id =
      crypto.randomUUID();

    const createdAt =
      new Date().toISOString();

    db.insert(activities)
      .values({
        id,
        roomId,

        type: parsed.data.type,

        prompt:
          parsed.data.prompt,

        state:
          "draft",

        responseEpoch: 0,

        config,

        deadlineAt: null,

        createdAt,
      })
      .run();

    return c.json(
      {
        id,
        roomId,

        type: parsed.data.type,

        prompt:
          parsed.data.prompt,

        state:
          "draft",

        config,

        deadlineAt: null,

        createdAt,
      },
      201,
    );
  },
);

// Available modes (host editor uses this)
roomRoutes.get(
  "/:roomId/modes",
  (c) => {
    return c.json(listModes());
  },
);
