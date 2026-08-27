import { count, eq } from "drizzle-orm";

import { db } from "../db";
import { participants } from "../db/schema";
import { roomHub } from "./room-hub";

const LEADING_MS = 16;
const COALESCE_MS = 80;

interface Pending {
  more: boolean;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Joins in a hall arrive together. One count event per window keeps 500
 * subscribers from receiving 500 identical participant.count frames.
 */
class ParticipantCountScheduler {
  private pending = new Map<string, Pending>();

  mark(roomId: string, delay = LEADING_MS) {
    const existing = this.pending.get(roomId);
    if (existing) {
      existing.more = true;
      return;
    }
    const entry: Pending = {
      more: false,
      timer: setTimeout(() => this.tick(roomId), delay),
    };
    entry.timer.unref?.();
    this.pending.set(roomId, entry);
  }

  private tick(roomId: string) {
    const entry = this.pending.get(roomId);
    if (!entry) return;
    this.pending.delete(roomId);
    if (entry.more) this.mark(roomId, COALESCE_MS);
    const total =
      db
        .select({ value: count() })
        .from(participants)
        .where(eq(participants.roomId, roomId))
        .get()?.value ?? 0;
    roomHub.publish(roomId, {
      type: "participant.count",
      roomId,
      count: total,
    });
  }
}

export const participantCountScheduler = new ParticipantCountScheduler();
