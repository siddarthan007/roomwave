// ---------------------------------------------------------------------------
// Dirty-activity scheduler: coalesces burst votes into one aggregate
// computation + broadcast per bounded interval, instead of per vote.
// Canonical state is always the database; this only paces broadcasts.
// ---------------------------------------------------------------------------

import { roomHub } from "../realtime/room-hub";
import { getRoomState } from "./room-state";

const COALESCE_MS = 350;
const PULSE_REFRESH_MS = 1_000;

interface PendingActivity {
  timer: ReturnType<typeof setTimeout> | null;
}

export class AggregateScheduler {
  private pending = new Map<string, PendingActivity>();

  markDirty(activityId: string, roomId: string, delay = COALESCE_MS) {
    let entry = this.pending.get(activityId);
    if (!entry) {
      entry = { timer: null };
      this.pending.set(activityId, entry);
    }

    if (entry.timer) return; // already scheduled

    entry.timer = setTimeout(() => {
      entry!.timer = null;
      this.pending.delete(activityId);
      this.flush(activityId, roomId);
    }, delay);
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
