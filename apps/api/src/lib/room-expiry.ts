import { eq, inArray, lt } from "drizzle-orm";

import { db } from "../db";
import { activities, rooms } from "../db/schema";
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
