import { and, eq, inArray, lt } from "drizzle-orm";

import { db } from "../db";
import { activities, participants, responses, rooms } from "../db/schema";
import { releaseRoomSequences } from "../realtime/event-sequence";
import { ROOM_TTL_MS } from "./rate-limit";

export function isRoomExpired(createdAt: string, now = Date.now()): boolean {
  const created = Date.parse(createdAt);
  return !Number.isFinite(created) || now - created >= ROOM_TTL_MS;
}

/** Coalesced callers may invoke this often; SQLite performs one indexed update. */
let lastExpirySweep = 0;
export function expireStaleRooms(now = Date.now()) {
  if (now - lastExpirySweep < 30_000) return;
  lastExpirySweep = now;
  const cutoff = new Date(now - ROOM_TTL_MS).toISOString();
  const expiredIds = db
    .select({ id: rooms.id })
    .from(rooms)
    .where(lt(rooms.createdAt, cutoff))
    .all()
    .map(({ id }) => id);
  if (expiredIds.length === 0) return;
  db.update(rooms)
    .set({ status: "ended", activeActivityId: null })
    .where(lt(rooms.createdAt, cutoff))
    .run();
  db.update(activities)
    .set({ state: "ended" })
    .where(
      inArray(activities.roomId, expiredIds),
    )
    .run();
}

/**
 * Hard-delete rooms that ended more than PURGE_AFTER_MS ago. Cascades remove
 * their activities/participants/responses and the unique code becomes
 * available again, keeping the 6-char space healthy on a long-lived server.
 * Bounded per sweep so a large backlog cannot stall the event loop.
 */
export const PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // one week
const MAX_PURGES_PER_SWEEP = 200;

let lastPurgeSweep = 0;
export function purgeEndedRooms(now = Date.now()) {
  if (now - lastPurgeSweep < 10 * 60_000) return;
  lastPurgeSweep = now;
  const cutoff = new Date(now - PURGE_AFTER_MS).toISOString();
  const doomed = db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(lt(rooms.createdAt, cutoff), eq(rooms.status, "ended")))
    .all()
    .map(({ id }) => id)
    .slice(0, MAX_PURGES_PER_SWEEP);
  if (doomed.length === 0) return;
  // Explicit child deletes keep the purge correct even where foreign keys
  // are unavailable (legacy repaired schemas).
  const activityIds = db
    .select({ id: activities.id })
    .from(activities)
    .where(inArray(activities.roomId, doomed))
    .all()
    .map(({ id }) => id);
  if (activityIds.length > 0) {
    db.delete(responses).where(inArray(responses.activityId, activityIds)).run();
  }
  db.delete(participants).where(inArray(participants.roomId, doomed)).run();
  db.delete(activities).where(inArray(activities.roomId, doomed)).run();
  db.delete(rooms).where(inArray(rooms.id, doomed)).run();
  for (const id of doomed) releaseRoomSequences(id);
}

// Standalone sweeper for long-lived processes; unref'd so tests can exit.
setInterval(() => {
  expireStaleRooms();
  purgeEndedRooms();
}, 5 * 60_000).unref?.();

export function endExpiredRoom(roomId: string) {
  db.update(rooms)
    .set({ status: "ended", activeActivityId: null })
    .where(eq(rooms.id, roomId))
    .run();
  db.update(activities)
    .set({ state: "ended" })
    .where(eq(activities.roomId, roomId))
    .run();
}
