import type { ActivityConfig } from "@roomwave/shared";

import { and, eq, isNotNull, lte } from "drizzle-orm";

import { db } from "../db";
import { activities } from "../db/schema";
import { roomHub } from "../realtime/room-hub";

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function deadlineFor(config: ActivityConfig, now = Date.now()) {
  if (config.type === "over-under") {
    if (config.timeLimitSeconds <= 0) return null;
    return new Date(now + config.timeLimitSeconds * 1000).toISOString();
  }
  if (
    config.type !== "signal-noise" &&
    config.type !== "cipher-room" &&
    config.type !== "shadow-council"
  ) {
    return null;
  }
  return new Date(now + config.timeLimitSeconds * 1000).toISOString();
}

export function cancelActivityDeadline(activityId: string) {
  const timer = timers.get(activityId);
  if (timer) clearTimeout(timer);
  timers.delete(activityId);
}

export function cancelDeadlinesForRoom(roomId: string) {
  const rows = db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.roomId, roomId))
    .all();
  for (const row of rows) cancelActivityDeadline(row.id);
}

export function scheduleActivityDeadline(
  activityId: string,
  roomId: string,
  deadlineAt: string | null,
) {
  cancelActivityDeadline(activityId);
  if (!deadlineAt) return;
  const delay = Math.max(0, Date.parse(deadlineAt) - Date.now());
  const timer = setTimeout(() => {
    timers.delete(activityId);
    void lockActivityIfExpired(activityId, roomId, true);
  }, delay);
  timer.unref?.();
  timers.set(activityId, timer);
}

export async function lockActivityIfExpired(
  activityId: string,
  roomId: string,
  publishSnapshot: boolean,
  now = Date.now(),
) {
  const nowIso = new Date(now).toISOString();
  const locked = db
    .update(activities)
    .set({ state: "locked", deadlineAt: null })
    .where(
      and(
        eq(activities.id, activityId),
        eq(activities.roomId, roomId),
        eq(activities.state, "live"),
        isNotNull(activities.deadlineAt),
        lte(activities.deadlineAt, nowIso),
      ),
    )
    .returning({ id: activities.id })
    .get();
  if (!locked) return false;

  cancelActivityDeadline(activityId);
  roomHub.publish(roomId, {
    type: "activity.state",
    roomId,
    activityId,
    state: "locked",
  });
  if (publishSnapshot) {
    const { getRoomState } = await import("./room-state");
    const state = getRoomState(roomId, now);
    if (state) roomHub.publish(roomId, { type: "room.snapshot", state });
  }
  return true;
}

export function lockDueActivityForRoom(roomId: string, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  // Lock EVERY due activity, not just the first: multiple can be due after
  // reset edge cases, and a single .get() leaves stale live state visible.
  const due = db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.roomId, roomId),
        eq(activities.state, "live"),
        isNotNull(activities.deadlineAt),
        lte(activities.deadlineAt, nowIso),
      ),
    )
    .all();
  for (const row of due) {
    void lockActivityIfExpired(row.id, roomId, false, now);
  }
}
