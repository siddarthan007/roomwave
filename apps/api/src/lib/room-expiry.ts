import { eq, inArray } from "drizzle-orm";

import { checkpointWal, db, sqlite } from "../db";
import { activities, participants, responses, rooms } from "../db/schema";
import { releaseRoomSequences } from "../realtime/event-sequence";
import { presenceHub } from "../realtime/presence-hub";
import { reactionHub } from "../realtime/reaction-hub";
import { roomHub } from "../realtime/room-hub";
import { cancelDeadlinesForRoom } from "../services/deadline-scheduler";

/** Quiet rooms older than this are ended, deleted, and their codes freed. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_PURGES_PER_SWEEP = 200;
const SWEEP_COALESCE_MS = 30_000;

const lastActiveQuery = sqlite.query(`
  SELECT max(
    created_at,
    coalesce((SELECT max(created_at) FROM activities WHERE room_id = rooms.id), created_at),
    coalesce((SELECT max(joined_at) FROM participants WHERE room_id = rooms.id), created_at),
    coalesce((
      SELECT max(responses.updated_at)
      FROM responses
      INNER JOIN activities ON activities.id = responses.activity_id
      WHERE activities.room_id = rooms.id
    ), created_at)
  ) AS last_active
  FROM rooms
  WHERE id = ?
`);

const idleRoomQuery = sqlite.query(`
  SELECT id FROM rooms
  WHERE max(
    created_at,
    coalesce((SELECT max(created_at) FROM activities WHERE room_id = rooms.id), created_at),
    coalesce((SELECT max(joined_at) FROM participants WHERE room_id = rooms.id), created_at),
    coalesce((
      SELECT max(responses.updated_at)
      FROM responses
      INNER JOIN activities ON activities.id = responses.activity_id
      WHERE activities.room_id = rooms.id
    ), created_at)
  ) < ?
  LIMIT ${MAX_PURGES_PER_SWEEP}
`);

export type RoomExpiryClock = {
  id: string;
  createdAt: string;
};

/** Latest durable create / join / round / response timestamp for a room. */
export function roomLastActiveAt(roomId: string, createdAt: string): string {
  const row = lastActiveQuery.get(roomId) as { last_active: string | null } | null;
  return row?.last_active ?? createdAt;
}

export function isRoomExpired(
  room: RoomExpiryClock,
  now = Date.now(),
): boolean {
  const created = Date.parse(room.createdAt);
  if (!Number.isFinite(created)) return true;
  const last = Date.parse(roomLastActiveAt(room.id, room.createdAt));
  return !Number.isFinite(last) || now - last >= ROOM_TTL_MS;
}

function forgetRoomRuntime(roomId: string) {
  cancelDeadlinesForRoom(roomId);
  presenceHub.forget(roomId);
  reactionHub.forget(roomId);
  roomHub.drop(roomId);
  releaseRoomSequences(roomId);
}

function deleteRooms(ids: string[]) {
  if (ids.length === 0) return;
  const activityIds = db
    .select({ id: activities.id })
    .from(activities)
    .where(inArray(activities.roomId, ids))
    .all()
    .map(({ id }) => id);

  // Explicit child deletes keep the purge correct even where foreign keys
  // are unavailable (legacy repaired schemas).
  sqlite.transaction(() => {
    if (activityIds.length > 0) {
      db.delete(responses).where(inArray(responses.activityId, activityIds)).run();
    }
    db.delete(participants).where(inArray(participants.roomId, ids)).run();
    db.delete(activities).where(inArray(activities.roomId, ids)).run();
    db.delete(rooms).where(inArray(rooms.id, ids)).run();
  })();
}

/** Coalesced callers may invoke this often; SQLite runs at most one sweep. */
let lastExpirySweep = 0;
export function expireStaleRooms(
  now = Date.now(),
  options: { force?: boolean } = {},
) {
  if (!options.force && now - lastExpirySweep < SWEEP_COALESCE_MS) return;
  lastExpirySweep = now;
  const cutoff = new Date(now - ROOM_TTL_MS).toISOString();
  const idleIds = (idleRoomQuery.all(cutoff) as Array<{ id: string }>).map(
    ({ id }) => id,
  );
  if (idleIds.length === 0) return;
  for (const id of idleIds) forgetRoomRuntime(id);
  deleteRooms(idleIds);
  checkpointWal();
}

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

// Standalone sweeper for long-lived processes; unref'd so tests can exit.
setInterval(() => {
  expireStaleRooms();
}, 5 * 60_000).unref?.();
