import type {
  Activity,
  ActivityConfig,
  PublicActivity,
  RoomMomentum,
  RoomState,
} from "@roomwave/shared";

import { and, count, eq, gte, lt } from "drizzle-orm";

import { db } from "../db";
import {
  activities,
  participants,
  responses,
  rooms,
} from "../db/schema";

import { aggregateActivity } from "./modes";
import { presenceHub } from "../realtime/presence-hub";
import { lockDueActivityForRoom } from "./deadline-scheduler";

const MOMENTUM_WINDOW_MS = 5_000;

function emptyMomentum(): RoomMomentum {
  return {
    recentRate: 0,
    previousRate: 0,
    delta: 0,
    trend: "steady",
  };
}

export function calculateMomentum(
  updatedAt: string[],
  now = Date.now(),
): RoomMomentum {
  let recent = 0;
  let previous = 0;

  for (const value of updatedAt) {
    const age = now - Date.parse(value);
    if (!Number.isFinite(age) || age < 0) continue;
    if (age < MOMENTUM_WINDOW_MS) recent += 1;
    else if (age < MOMENTUM_WINDOW_MS * 2) previous += 1;
  }

  return momentumFromCounts(recent, previous);
}

function momentumFromCounts(recent: number, previous: number): RoomMomentum {
  const recentRate = Math.round((recent / 5) * 10) / 10;
  const previousRate = Math.round((previous / 5) * 10) / 10;
  const delta = Math.round((recentRate - previousRate) * 10) / 10;
  const threshold = 0.2;

  return {
    recentRate,
    previousRate,
    delta,
    trend:
      delta > threshold
        ? "building"
        : delta < -threshold
          ? "cooling"
          : "steady",
  };
}

function hasBlindResults(config: ActivityConfig): boolean {
  // Configs created before blind mode shipped remain live-result activities.
  return config.resultsMode === "blind";
}

/** Never expose a Prediction Battle truth before the reveal transition. */
function toPublicActivity(activity: Activity): PublicActivity {
  if (activity.state === "revealed") {
    return activity;
  }

  if (activity.config.type === "signal-noise") {
    return {
      ...activity,
      config: {
        ...activity.config,
        correctAnswer: null,
        explanation: "",
      },
    };
  }

  if (activity.config.type === "cipher-room") {
    return {
      ...activity,
      config: {
        ...activity.config,
        correctShift: null,
      },
    };
  }

  if (activity.config.type === "shadow-council") {
    return {
      ...activity,
      config: {
        ...activity.config,
        shadowAliasId: null,
      },
    };
  }

  if (activity.config.type !== "prediction") return activity;

  return {
    ...activity,
    config: {
      ...activity.config,
      answer: null,
    },
  };
}

export function getRoomState(
  roomId: string,
  now = Date.now(),
): RoomState | null {
  lockDueActivityForRoom(roomId, now);
  const room = db
    .select({
      id: rooms.id,
      code: rooms.code,
      title: rooms.title,
      status: rooms.status,
      activeActivityId: rooms.activeActivityId,
      settings: rooms.settings,
      createdAt: rooms.createdAt,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .get();

  if (!room) return null;

  const presence = presenceHub.snapshot(roomId, room.settings.showPresence, now);
  const serverNow = new Date(now).toISOString();

  const participantCount =
    db
      .select({ value: count() })
      .from(participants)
      .where(eq(participants.roomId, roomId))
      .get()?.value ?? 0;

  if (!room.activeActivityId) {
    return {
      room,
      activity: null,
      aggregate: null,
      participantCount,
      onlineCount: presence.onlineCount,
      presence: presence.participants,
      responseCount: 0,
      momentum: emptyMomentum(),
      serverNow,
    };
  }

  const activity = db
    .select()
    .from(activities)
    .where(eq(activities.id, room.activeActivityId))
    .get();

  if (!activity) {
    return {
      room,
      activity: null,
      aggregate: null,
      participantCount,
      onlineCount: presence.onlineCount,
      presence: presence.participants,
      responseCount: 0,
      momentum: emptyMomentum(),
      serverNow,
    };
  }

  const storedResponseCount =
    db
      .select({ value: count() })
      .from(responses)
      .where(eq(responses.activityId, activity.id))
      .get()?.value ?? 0;
  const canonicalAggregate = aggregateActivity(activity);
  // Question votes are engagement signals, not additional respondents.
  const responseCount =
    canonicalAggregate.type === "question-board"
      ? canonicalAggregate.total
      : storedResponseCount;
  const recentCutoff = new Date(now - MOMENTUM_WINDOW_MS).toISOString();
  const previousCutoff = new Date(now - MOMENTUM_WINDOW_MS * 2).toISOString();
  let recentCount: number;
  let previousCount: number;
  if (activity.type === "question-board") {
    const contributions = db
      .select({ payload: responses.payload, updatedAt: responses.updatedAt })
      .from(responses)
      .where(eq(responses.activityId, activity.id))
      .all()
      .filter(
        ({ payload }) =>
          payload.type === "question-board" && payload.action === "submit",
      );
    recentCount = contributions.filter(
      ({ updatedAt }) => updatedAt >= recentCutoff,
    ).length;
    previousCount = contributions.filter(
      ({ updatedAt }) =>
        updatedAt >= previousCutoff && updatedAt < recentCutoff,
    ).length;
  } else {
    recentCount =
      db
        .select({ value: count() })
        .from(responses)
        .where(
          and(
            eq(responses.activityId, activity.id),
            gte(responses.updatedAt, recentCutoff),
          ),
        )
        .get()?.value ?? 0;
    previousCount =
      db
        .select({ value: count() })
        .from(responses)
        .where(
          and(
            eq(responses.activityId, activity.id),
            gte(responses.updatedAt, previousCutoff),
            lt(responses.updatedAt, recentCutoff),
          ),
        )
        .get()?.value ?? 0;
  }

  const resultsHidden =
    hasBlindResults(activity.config) && activity.state !== "revealed";

  return {
    room,
    activity: toPublicActivity(activity),
    aggregate: resultsHidden ? null : canonicalAggregate,
    participantCount,
    onlineCount: presence.onlineCount,
    presence: presence.participants,
    responseCount,
    momentum: momentumFromCounts(recentCount, previousCount),
    serverNow,
  };
}
