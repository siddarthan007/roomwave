import type {
  ActivityConfig,
  ActivityState,
  ResponsePayload,
} from "@roomwave/shared";
import { activityRequiresReveal } from "@roomwave/shared";

import { Hono } from "hono";
import { and, count, eq } from "drizzle-orm";

import { db } from "../db";
import {
  activities,
  responses,
  rooms,
} from "../db/schema";

import {
  getBearerToken,
  findParticipantByToken,
  isHostAuthorized,
} from "../lib/auth";

import { roomHub } from "../realtime/room-hub";
import { reactionHub } from "../realtime/reaction-hub";
import { presenceHub } from "../realtime/presence-hub";
import {
  crowdMeterLimiter,
  reactionParticipantLimiter,
  reactionRoomLimiter,
  responseLimiter,
  publicReadLimiter,
} from "../lib/rate-limit";

import { aggregateScheduler } from "../services/aggregate-scheduler";
import {
  aggregateActivity,
  getMode,
  validateResponseFor,
} from "../services/modes";
import { canReset, canTransition } from "../services/activity-state";
import { getRoomState } from "../services/room-state";
import {
  cancelActivityDeadline,
  deadlineFor,
  lockActivityIfExpired,
  scheduleActivityDeadline,
} from "../services/deadline-scheduler";
import type { AppContext, AppEnv } from "../lib/app-env";
import { remoteClientKey } from "../lib/app-env";
import { endExpiredRoom, isRoomExpired } from "../lib/room-expiry";

export const activityRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function requireHost(
  c: AppContext,
  roomId: string,
): Promise<boolean> {
  const token = getBearerToken(
    c.req.header("Authorization"),
  );
  return Boolean(
    token && (await isHostAuthorized(roomId, token)),
  );
}

function findActivity(activityId: string) {
  return db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .get();
}

/** Final synchronous guard shared by the route and reset-generation tests. */
export function findWritableResponseActivity(
  activityId: string,
  expectedEpoch: number,
) {
  const activity = findActivity(activityId);
  if (
    !activity ||
    activity.state !== "live" ||
    activity.responseEpoch !== expectedEpoch ||
    (activity.deadlineAt !== null && Date.parse(activity.deadlineAt) <= Date.now())
  ) return null;
  const room = db
    .select({
      status: rooms.status,
      activeActivityId: rooms.activeActivityId,
      createdAt: rooms.createdAt,
      settings: rooms.settings,
    })
    .from(rooms)
    .where(eq(rooms.id, activity.roomId))
    .get();
  if (
    !room ||
    room.status !== "live" ||
    room.activeActivityId !== activityId ||
    isRoomExpired(room.createdAt)
  ) return null;
  return activity;
}

// Aggregates are intentionally computed from durable rows. Keep a hard ceiling
// so one round cannot turn each live read into an unbounded table scan.
const MAX_APPEND_ROWS_PER_ACTIVITY = 25_000;
const MAX_WORDS_PER_PARTICIPANT = 20;
const MAX_TAPS_PER_PARTICIPANT = 2_000;
const MAX_QUESTIONS_PER_PARTICIPANT = 5;

function appendLimitMessage(
  activityId: string,
  participantId: string,
  payload: ResponsePayload,
): string | null {
  const appendOnly =
    payload.type === "word-bloom" ||
    payload.type === "crowd-meter" ||
    payload.type === "question-board";
  if (!appendOnly) return null;

  const total =
    db
      .select({ value: count() })
      .from(responses)
      .where(eq(responses.activityId, activityId))
      .get()?.value ?? 0;
  if (total >= MAX_APPEND_ROWS_PER_ACTIVITY) {
    return "This round has reached its safe response capacity.";
  }

  const ownRows = db
    .select({ payload: responses.payload })
    .from(responses)
    .where(
      and(
        eq(responses.activityId, activityId),
        eq(responses.participantId, participantId),
      ),
    )
    .all();

  if (
    payload.type === "word-bloom" &&
    ownRows.filter(({ payload: stored }) => stored.type === "word-bloom")
      .length >= MAX_WORDS_PER_PARTICIPANT
  ) {
    return "You have filled your word slots for this round.";
  }
  if (
    payload.type === "crowd-meter" &&
    ownRows.filter(({ payload: stored }) => stored.type === "crowd-meter")
      .length >= MAX_TAPS_PER_PARTICIPANT
  ) {
    return "Your tap meter is full for this round.";
  }
  if (
    payload.type === "question-board" &&
    payload.action === "submit" &&
    ownRows.filter(
      ({ payload: stored }) =>
        stored.type === "question-board" && stored.action === "submit",
    ).length >= MAX_QUESTIONS_PER_PARTICIPANT
  ) {
    return "You have used your five question slots for this round.";
  }

  return null;
}

function withModerationStatus(
  config: ActivityConfig,
  payload: ResponsePayload,
): ResponsePayload {
  if (payload.type === "word-bloom" && config.type === "word-bloom") {
    return {
      ...payload,
      moderation: config.moderationMode === "review" ? "pending" : "visible",
    };
  }
  if (
    payload.type === "question-board" &&
    payload.action === "submit" &&
    config.type === "question-board"
  ) {
    return {
      ...payload,
      moderation: config.moderationMode === "review" ? "pending" : "visible",
    };
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Host: start / lock / unlock(re-open) / reveal / reset / end
// ---------------------------------------------------------------------------

async function hostActivityAction(c: AppContext) {
  const activityId = c.req.param("activityId")!;
  const actionParam = c.req.param("action")!;

  if (
    actionParam === "responses" ||
    actionParam === "reactions" ||
    !["start", "lock", "reopen", "reveal", "reset", "end"].includes(actionParam)
  ) {
    return c.json(
      {
        error: { code: "NOT_FOUND", message: "Unknown action." },
      },
      404,
    );
  }

  const action = actionParam as
    | "start"
    | "lock"
    | "reopen"
    | "reveal"
    | "reset"
    | "end";

  const foundActivity = findActivity(activityId);
  if (!foundActivity) {
    return c.json(
      {
        error: {
          code: "ACTIVITY_NOT_FOUND",
          message: "Activity not found.",
        },
      },
      404,
    );
  }

  if (!(await requireHost(c, foundActivity.roomId))) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid host token.",
        },
      },
      401,
    );
  }

  // Host token verification yields. Work from fresh durable rows for the
  // synchronous transition so overlapping actions cannot use old state.
  const activity = findActivity(activityId);
  if (!activity) {
    return c.json(
      {
        error: {
          code: "ACTIVITY_NOT_FOUND",
          message: "Activity not found.",
        },
      },
      404,
    );
  }

  const authoritativeRoom = db
    .select({
      status: rooms.status,
      activeActivityId: rooms.activeActivityId,
      createdAt: rooms.createdAt,
      settings: rooms.settings,
    })
    .from(rooms)
    .where(eq(rooms.id, activity.roomId))
    .get();
  if (
    !authoritativeRoom ||
    authoritativeRoom.status === "ended" ||
    isRoomExpired(authoritativeRoom.createdAt)
  ) {
    if (authoritativeRoom?.status !== "ended") endExpiredRoom(activity.roomId);
    return c.json(
      { error: { code: "ROOM_ENDED", message: "This room has ended." } },
      409,
    );
  }

  const targetMap = {
    start: "live",
    lock: "locked",
    reopen: "live",
    reveal: "revealed",
    end: "ended",
  } as const;

  if (action === "reset") {
    if (!canReset(activity.state)) {
      return c.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot reset an activity that is ${activity.state}.`,
          },
        },
        409,
      );
    }

    if (
      authoritativeRoom.activeActivityId &&
      authoritativeRoom.activeActivityId !== activity.id
    ) {
      return c.json(
        {
          error: {
            code: "ACTIVITY_ACTIVE",
            message: "End the current round before resetting another.",
          },
        },
        409,
      );
    }

    // Reset is intentionally destructive, host-only, and synchronous: remove
    // old responses, restore the round to live, then publish the zero snapshot.
    const resetDeadline = deadlineFor(activity.config);
    const reset = db.update(activities)
      .set({
        state: "live",
        responseEpoch: activity.responseEpoch + 1,
        deadlineAt: resetDeadline,
      })
      .where(
        and(
          eq(activities.id, activity.id),
          eq(activities.state, activity.state),
          eq(activities.responseEpoch, activity.responseEpoch),
        ),
      )
      .returning({ id: activities.id })
      .get();
    if (!reset) {
      return c.json(
        {
          error: {
            code: "ACTIVITY_CHANGED",
            message: "The round changed while this action was being applied.",
          },
        },
        409,
      );
    }
    db.delete(responses)
      .where(eq(responses.activityId, activity.id))
      .run();
    db.update(rooms)
      .set({ status: "live", activeActivityId: activity.id })
      .where(eq(rooms.id, activity.roomId))
      .run();
    scheduleActivityDeadline(activity.id, activity.roomId, resetDeadline);

    roomHub.publish(activity.roomId, {
      type: "activity.state",
      roomId: activity.roomId,
      activityId: activity.id,
      state: "live",
    });
    roomHub.publish(activity.roomId, {
      type: "activity.started",
      roomId: activity.roomId,
      activityId: activity.id,
    });

    const state = getRoomState(activity.roomId);
    if (state) {
      roomHub.publish(activity.roomId, {
        type: "aggregate.updated",
        roomId: activity.roomId,
        activityId: activity.id,
        aggregate: state.aggregate,
        responseCount: state.responseCount,
        momentum: state.momentum,
      });
      roomHub.publish(activity.roomId, {
        type: "room.snapshot",
        state,
      });
    }

    return c.json({ success: true, state: "live" as const });
  }

  if (action === "reveal" && !activityRequiresReveal(activity.config)) {
    return c.json(
      {
        error: {
          code: "REVEAL_NOT_REQUIRED",
          message: "This mode already shows its final result when responses close.",
        },
      },
      409,
    );
  }

  const target = targetMap[action] as ActivityState;
  const before = activity.state;

  if (!canTransition(activity.state, target)) {
    return c.json(
      {
        error: {
          code: "INVALID_TRANSITION",
          message: `Cannot ${action} an activity that is ${before}.`,
        },
      },
      409,
    );
  }

  if (target === "live") {
    if (
      authoritativeRoom.activeActivityId &&
      authoritativeRoom.activeActivityId !== activity.id
    ) {
      const other = findActivity(authoritativeRoom.activeActivityId);
      if (other && other.state !== "ended") {
        return c.json(
          {
            error: {
              code: "ACTIVITY_ACTIVE",
              message: "End the current round before starting another.",
            },
          },
          409,
        );
      }
    }
  }

  // All durable state changes happen before the first lifecycle event.
  const nextDeadline = target === "live" ? deadlineFor(activity.config) : null;
  const transition = db.update(activities)
    .set({ state: target, deadlineAt: nextDeadline })
    .where(
      and(
        eq(activities.id, activity.id),
        eq(activities.state, before),
      ),
    )
    .returning({ id: activities.id })
    .get();
  if (!transition) {
    return c.json(
      {
        error: {
          code: "ACTIVITY_CHANGED",
          message: "The round changed while this action was being applied.",
        },
      },
      409,
    );
  }

  if (target === "live") {
    scheduleActivityDeadline(activity.id, activity.roomId, nextDeadline);
  } else {
    cancelActivityDeadline(activity.id);
  }

  if (target === "live") {
    db.update(rooms)
      .set({ status: "live", activeActivityId: activity.id })
      .where(eq(rooms.id, activity.roomId))
      .run();

  } else if (target === "ended") {
    db.update(rooms)
      .set({ status: "lobby", activeActivityId: null })
      .where(
        and(
          eq(rooms.id, activity.roomId),
          eq(rooms.activeActivityId, activity.id),
        ),
      )
      .run();
  }

  roomHub.publish(activity.roomId, {
    type: "activity.state",
    roomId: activity.roomId,
    activityId: activity.id,
    state: target as Exclude<ActivityState, "draft">,
  });

  if (target === "live") {
    roomHub.publish(activity.roomId, {
      type: "activity.started",
      roomId: activity.roomId,
      activityId: activity.id,
    });
  }

  const canonicalState = getRoomState(activity.roomId);
  if (canonicalState) {
    roomHub.publish(activity.roomId, {
      type: "room.snapshot",
      state: canonicalState,
    });
  }

  return c.json({ success: true, state: target });
}


// ---------------------------------------------------------------------------
// Participant: submit a response
// ---------------------------------------------------------------------------

activityRoutes.post("/:activityId/responses", async (c) => {
  const activityId = c.req.param("activityId");

  const activity = findActivity(activityId);
  if (!activity) {
    return c.json(
      {
        error: {
          code: "ACTIVITY_NOT_FOUND",
          message: "Activity not found.",
        },
      },
      404,
    );
  }

  await lockActivityIfExpired(activity.id, activity.roomId, true);

  const currentActivity = findActivity(activityId);
  if (!currentActivity || currentActivity.state !== "live") {
    return c.json(
      {
        error: {
          code: "ACTIVITY_NOT_LIVE",
          message: "This activity is not accepting responses.",
        },
      },
      409,
    );
  }

  if (activity.state !== "live") {
    return c.json(
      {
        error: {
          code: "ACTIVITY_NOT_LIVE",
          message: "This activity is not accepting responses.",
        },
      },
      409,
    );
  }

  const responseRoom = db
    .select({
      status: rooms.status,
      activeActivityId: rooms.activeActivityId,
      createdAt: rooms.createdAt,
      settings: rooms.settings,
    })
    .from(rooms)
    .where(eq(rooms.id, activity.roomId))
    .get();
  if (
    !responseRoom ||
    responseRoom.status === "ended" ||
    isRoomExpired(responseRoom.createdAt)
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

  const token = getBearerToken(
    c.req.header("Authorization"),
  );

  if (!token) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Participant token required.",
        },
      },
      401,
    );
  }

  const participant = await findParticipantByToken(token);

  if (!participant || participant.roomId !== activity.roomId) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid participant.",
        },
      },
      401,
    );
  }

  const limiter =
    activity.type === "crowd-meter" ? crowdMeterLimiter : responseLimiter;

  if (!limiter.allow(`${activity.type}:${participant.id}`)) {
    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Slow down a moment, then try again.",
        },
      },
      429,
    );
  }

  const json = await c.req.json().catch(() => null);
  const result = validateResponseFor(activity, json);
  if (!result.ok) {
    return c.json(
      {
        error: { code: "INVALID_RESPONSE", message: result.message },
      },
      400,
    );
  }

  // Participant lookup and body parsing yield. Lock, reveal and end must win
  // if they happened while this request was being verified.
  const writableActivity = findWritableResponseActivity(
    activityId,
    activity.responseEpoch,
  );
  if (!writableActivity) {
    return c.json(
      {
        error: {
          code: "ACTIVITY_NOT_LIVE",
          message: "This activity is not accepting responses.",
        },
      },
      409,
    );
  }

  if (
    result.payload.type === "question-board" &&
    result.payload.action === "upvote"
  ) {
    const questionId = result.payload.questionId;
    const target = db
      .select({ payload: responses.payload })
      .from(responses)
      .where(
        and(
          eq(responses.id, questionId),
          eq(responses.activityId, activityId),
        ),
      )
      .get();
    if (
      !target ||
      target.payload.type !== "question-board" ||
      target.payload.action !== "submit" ||
      target.payload.moderation === "pending" ||
      target.payload.moderation === "hidden"
    ) {
      return c.json(
        {
          error: {
            code: "QUESTION_NOT_FOUND",
            message: "That question is no longer on this board.",
          },
        },
        404,
      );
    }

    // Upvotes are idempotent per participant/question. Duplicate taps are
    // acknowledged without storing unbounded event rows.
    const priorActions = db
      .select({ payload: responses.payload })
      .from(responses)
      .where(
        and(
          eq(responses.activityId, activityId),
          eq(responses.participantId, participant.id),
        ),
      )
      .all();
    if (
      priorActions.some(
        ({ payload }) =>
          payload.type === "question-board" &&
          payload.action === "upvote" &&
          payload.questionId === questionId,
      )
    ) {
      return c.json({ success: true, duplicate: true });
    }
  }

  const appendLimit = appendLimitMessage(
    activityId,
    participant.id,
    result.payload,
  );
  if (appendLimit) {
    return c.json(
      {
        error: {
          code: "ROUND_LIMIT_REACHED",
          message: appendLimit,
        },
      },
      429,
    );
  }

  const now = new Date().toISOString();
  const storedPayload = withModerationStatus(
    writableActivity.config,
    result.payload,
  );

  const mode = getMode(writableActivity.type);
  const single = mode?.singleResponsePerParticipant ?? true;

  if (single) {
    // One live answer slot per participant. There is no database-wide unique
    // constraint because append-only modes use the same response table.
    const existing = db
      .select({ id: responses.id })
      .from(responses)
      .where(
        and(
          eq(responses.activityId, activityId),
          eq(responses.participantId, participant.id),
        ),
      )
      .get();

    if (existing) {
      db.update(responses)
        .set({ payload: storedPayload, updatedAt: now })
        .where(eq(responses.id, existing.id))
        .run();
    } else {
      db.insert(responses)
        .values({
          id: crypto.randomUUID(),
          activityId,
          participantId: participant.id,
          payload: storedPayload,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  } else {
    // Multi-submission modes (words, taps): every submission appends.
    db.insert(responses)
      .values({
        id: crypto.randomUUID(),
        activityId,
        participantId: participant.id,
        payload: storedPayload,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // Ephemeral arrival hint (lossy by design).
  presenceHub.touch(
    writableActivity.roomId,
    {
      id: participant.id,
      displayName: participant.displayName,
      avatarSeed: participant.avatarSeed,
    },
    responseRoom.settings.showPresence,
  );
  roomHub.publish(writableActivity.roomId, {
    type: "response.created",
    roomId: writableActivity.roomId,
    activityId,
  });

  // Canonical aggregate follows on a coalesced schedule.
  aggregateScheduler.markDirty(activityId, writableActivity.roomId);

  return c.json({
    success: true,
    moderation:
      storedPayload.type === "word-bloom" ||
      (storedPayload.type === "question-board" &&
        storedPayload.action === "submit")
        ? storedPayload.moderation
        : undefined,
  });
});

// ---------------------------------------------------------------------------
// Participant: ephemeral reactions
// ---------------------------------------------------------------------------

activityRoutes.post("/reactions", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = (
    await import("@roomwave/shared")
  ).sendReactionSchema.safeParse(json);

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "INVALID_REACTION",
          message: "Unknown reaction.",
        },
      },
      400,
    );
  }

  const roomId = c.req.header("X-Room-Id") ?? "";
  if (!roomId) {
    return c.json(
      {
        error: { code: "ROOM_REQUIRED", message: "Room required." },
      },
      400,
    );
  }

  const room = db
    .select({
      id: rooms.id,
      status: rooms.status,
      createdAt: rooms.createdAt,
      settings: rooms.settings,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .get();

  if (!room) {
    return c.json(
      {
        error: { code: "ROOM_NOT_FOUND", message: "Room not found." },
      },
      404,
    );
  }

  if (room.status === "ended" || isRoomExpired(room.createdAt)) {
    return c.json(
      {
        error: { code: "ROOM_ENDED", message: "This room has ended." },
      },
      409,
    );
  }

  if (!room.settings.allowReactions) {
    return c.json({ success: true, disabled: true });
  }

  const token = getBearerToken(c.req.header("Authorization"));
  const participant = token ? await findParticipantByToken(token) : null;
  if (!participant || participant.roomId !== roomId) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Join the room before sending reactions.",
        },
      },
      401,
    );
  }

  const currentRoom = db
    .select({ status: rooms.status, createdAt: rooms.createdAt, settings: rooms.settings })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .get();
  if (
    !currentRoom ||
    currentRoom.status === "ended" ||
    isRoomExpired(currentRoom.createdAt)
  ) {
    return c.json(
      {
        error: { code: "ROOM_ENDED", message: "This room has ended." },
      },
      409,
    );
  }

  if (
    !reactionParticipantLimiter.allow(participant.id) ||
    !reactionRoomLimiter.allow(roomId)
  ) {
    // Silently absorb excess reactions because they are ephemeral energy, not data.
    return c.json({ success: true, sampled: true });
  }

  reactionHub.add(roomId, parsed.data.kind);
  presenceHub.touch(
    roomId,
    {
      id: participant.id,
      displayName: participant.displayName,
      avatarSeed: participant.avatarSeed,
    },
    currentRoom.settings.showPresence,
  );

  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Host: mark a public question answered/unanswered
// ---------------------------------------------------------------------------

activityRoutes.patch("/:activityId/questions/:questionId", async (c) => {
  const activity = findActivity(c.req.param("activityId"));
  if (!activity || activity.type !== "question-board") {
    return c.json(
      { error: { code: "ACTIVITY_NOT_FOUND", message: "Question board not found." } },
      404,
    );
  }
  if (!(await requireHost(c, activity.roomId))) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid host token." } },
      401,
    );
  }
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.answered !== "boolean") {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "Answered state is required." } },
      400,
    );
  }
  const question = db
    .select({ payload: responses.payload })
    .from(responses)
    .where(
      and(
        eq(responses.id, c.req.param("questionId")),
        eq(responses.activityId, activity.id),
      ),
    )
    .get();
  if (
    !question ||
    question.payload.type !== "question-board" ||
    question.payload.action !== "submit"
  ) {
    return c.json(
      { error: { code: "QUESTION_NOT_FOUND", message: "Question not found." } },
      404,
    );
  }
  db.update(responses)
    .set({
      payload: { ...question.payload, answered: body.answered },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(responses.id, c.req.param("questionId")))
    .run();
  aggregateScheduler.markDirty(activity.id, activity.roomId);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Host: public text review queue and removal
// ---------------------------------------------------------------------------

activityRoutes.get("/:activityId/moderation", async (c) => {
  const activity = findActivity(c.req.param("activityId"));
  if (
    !activity ||
    (activity.type !== "word-bloom" && activity.type !== "question-board")
  ) {
    return c.json(
      { error: { code: "ACTIVITY_NOT_FOUND", message: "Text round not found." } },
      404,
    );
  }
  if (!(await requireHost(c, activity.roomId))) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid host token." } },
      401,
    );
  }

  const items = db
    .select({
      id: responses.id,
      payload: responses.payload,
      createdAt: responses.createdAt,
    })
    .from(responses)
    .where(eq(responses.activityId, activity.id))
    .all()
    .flatMap(({ id, payload, createdAt }) => {
      if (payload.type === "word-bloom") {
        return [{
          id,
          text: payload.text,
          status: payload.moderation ?? "visible" as const,
          createdAt,
        }];
      }
      if (payload.type === "question-board" && payload.action === "submit") {
        return [{
          id,
          text: payload.question,
          status: payload.moderation ?? "visible" as const,
          createdAt,
        }];
      }
      return [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);

  return c.json({ items });
});

activityRoutes.patch("/:activityId/moderation/:responseId", async (c) => {
  const activity = findActivity(c.req.param("activityId"));
  if (
    !activity ||
    (activity.type !== "word-bloom" && activity.type !== "question-board")
  ) {
    return c.json(
      { error: { code: "ACTIVITY_NOT_FOUND", message: "Text round not found." } },
      404,
    );
  }
  if (!(await requireHost(c, activity.roomId))) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid host token." } },
      401,
    );
  }
  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    (body.status !== "visible" && body.status !== "hidden")
  ) {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "Choose show or hide." } },
      400,
    );
  }
  const row = db
    .select({ payload: responses.payload })
    .from(responses)
    .where(
      and(
        eq(responses.id, c.req.param("responseId")),
        eq(responses.activityId, activity.id),
      ),
    )
    .get();
  if (!row) {
    return c.json(
      { error: { code: "TEXT_NOT_FOUND", message: "Text item not found." } },
      404,
    );
  }
  const payload = row.payload;
  if (
    payload.type !== "word-bloom" &&
    !(payload.type === "question-board" && payload.action === "submit")
  ) {
    return c.json(
      { error: { code: "TEXT_NOT_FOUND", message: "Text item not found." } },
      404,
    );
  }
  db.update(responses)
    .set({
      payload: { ...payload, moderation: body.status },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(responses.id, c.req.param("responseId")))
    .run();
  aggregateScheduler.markDirty(activity.id, activity.roomId);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// Results (aggregate; prediction truth gated by reveal state in DB)
// ---------------------------------------------------------------------------

activityRoutes.get("/:activityId/results", (c) => {
  const activity = findActivity(c.req.param("activityId"));
  if (!activity) {
    return c.json(
      {
        error: {
          code: "ACTIVITY_NOT_FOUND",
          message: "Activity not found.",
        },
      },
      404,
    );
  }
  if (
    activity.config.resultsMode === "blind" &&
    activity.state !== "revealed"
  ) {
    return c.json(
      {
        error: {
          code: "RESULTS_HIDDEN",
          message: "Results are hidden until the host reveals them.",
        },
      },
      409,
    );
  }
  if (
    !publicReadLimiter.allow(
      `${remoteClientKey(c)}:results:${activity.id}`,
    )
  ) {
    return c.json(
      { error: { code: "RATE_LIMITED", message: "Refresh again shortly." } },
      429,
    );
  }
  return c.json(aggregateActivity(activity));
});

// Registered AFTER the specific /responses and /reactions routes so the
// generic :action segment never shadows them.
activityRoutes.post("/:activityId/:action", hostActivityAction);
