// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter (per process, per MVP).
// Room-scoped buckets; entries self-expire so memory stays bounded.
// ---------------------------------------------------------------------------

interface Window {
  hits: number[];
}

export class RateLimiter {
  private windows = new Map<string, Window>();
  private lastSweep = Date.now();

  constructor(
    private maxHits: number,
    private windowMs: number,
  ) {}

  /** Returns true when the action is allowed. */
  allow(key: string, now = Date.now()): boolean {
    this.sweep(now);

    let window = this.windows.get(key);
    if (!window) {
      window = { hits: [] };
      this.windows.set(key, window);
    }

    window.hits = window.hits.filter((time) => now - time < this.windowMs);

    if (window.hits.length >= this.maxHits) {
      return false;
    }

    window.hits.push(now);
    return true;
  }

  /** Drop stale windows every few minutes so the map cannot grow forever. */
  private sweep(now: number) {
    if (now - this.lastSweep < 120_000) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (
        window.hits.length === 0 ||
        now - window.hits[window.hits.length - 1] > this.windowMs * 2
      ) {
        this.windows.delete(key);
      }
    }
  }
}

/** Room creation: strict enough to stop scripts, generous for local demos. */
export const roomCreateLimiter = new RateLimiter(5, 60_000);
export const globalRoomCreateLimiter = new RateLimiter(300, 60_000);

/** Joining: limits repeated participant creation from one address + room. */
export const joinLimiter = new RateLimiter(30, 60_000);
export const joinAttemptLimiter = new RateLimiter(60, 60_000);
export const globalJoinAttemptLimiter = new RateLimiter(3_000, 60_000);

/** Public snapshots are useful, but cannot be an unlimited aggregate oracle. */
export const publicReadLimiter = new RateLimiter(120, 60_000);

/** Authenticated presence leases: reconnect-friendly, bounded before hashing. */
export const presenceLimiter = new RateLimiter(120, 60_000);

/** Responses: 12 per participant per 10 s (answer changes still easy). */
export const responseLimiter = new RateLimiter(12, 10_000);

/** Repeated-input mode: four taps/second with a small burst allowance. */
export const crowdMeterLimiter = new RateLimiter(20, 5_000);

/** Reactions: per-person fairness plus a high room-level safety ceiling. */
export const reactionParticipantLimiter = new RateLimiter(4, 2_000);
export const reactionRoomLimiter = new RateLimiter(240, 1_000);

/** Public event stream reconnects: enough for tabs, bounded against churn. */
export const eventStreamLimiter = new RateLimiter(30, 60_000);

/**
 * Host commands: authenticated, but a buggy host client or leaked token must
 * not hammer transitions/moderation/settings unbounded. Generous — a host
 * toggling settings and running rounds never feels this.
 */
export const hostCommandLimiter = new RateLimiter(120, 60_000);

/** One room may fill a hall, but must not grow listeners without a ceiling. */
export const MAX_EVENT_SUBSCRIBERS_PER_ROOM = 500;
export const MAX_EVENT_SUBSCRIBERS_GLOBAL = 2_000;
