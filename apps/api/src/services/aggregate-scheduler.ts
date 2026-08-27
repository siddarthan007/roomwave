// ---------------------------------------------------------------------------
// Dirty-activity scheduler: coalesces burst votes into one aggregate
// computation + broadcast per bounded interval, instead of per vote.
// Canonical state is always the database; this only paces broadcasts.
// Quiet rooms flush on a 16ms leading edge so the projector moves with
// the first tap; a 500-vote burst still folds into the 80ms window instead
// of broadcasting one aggregate per person.
// ---------------------------------------------------------------------------

import { roomHub } from "../realtime/room-hub";
import { getRoomState } from "./room-state";

const COALESCE_MS = 80;
const LEADING_MS = 16;
const PULSE_REFRESH_MS = 1_000;

interface PendingActivity {
  roomId: string;
  more: boolean;
  timer: ReturnType<typeof setTimeout>;
}

export class AggregateScheduler {
  private pending = new Map<string, PendingActivity>();

  markDirty(activityId: string, roomId: string, delay = LEADING_MS) {
    const existing = this.pending.get(activityId);
    if (existing) {
      existing.more = true;
      return;
    }

    const entry: PendingActivity = {
      roomId,
      more: false,
      timer: setTimeout(() => this.tick(activityId), delay),
    };
    entry.timer.unref?.();
    this.pending.set(activityId, entry);
  }

  private tick(activityId: string) {
    const entry = this.pending.get(activityId);
    if (!entry) return;
    const { roomId, more } = entry;
    this.pending.delete(activityId);
    if (more) this.markDirty(activityId, roomId, COALESCE_MS);
    this.flush(activityId, roomId);
  }

  private flush(activityId: string, roomId: string) {
    const state = getRoomState(roomId);
    if (!state?.activity || state.activity.id !== activityId) return;

    roomHub.publish(roomId, {
      type: "aggregate.updated",
      roomId,
      activityId,
      aggregate: state.aggregate,
      responseCount: state.responseCount,
      momentum: state.momentum,
    });

    // Let rolling momentum and Crowd Meter intensity decay on screen even
    // after the final tap. The refresh stops by itself once both windows are
    // empty, so idle rooms have no timers or database work.
    const hasRollingEnergy =
      state.momentum.recentRate > 0 ||
      state.momentum.previousRate > 0 ||
      (state.aggregate?.type === "crowd-meter" && state.aggregate.recent > 0);

    if (hasRollingEnergy) {
      this.markDirty(activityId, roomId, PULSE_REFRESH_MS);
    }
  }
}

export const aggregateScheduler = new AggregateScheduler();
