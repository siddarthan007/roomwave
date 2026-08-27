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

  /** Test hook: isolation between files that share one process. */
  clear() {
    this.windows.clear();
  }
}

/** Room creation: strict enough to stop scripts, generous for local demos. */
export const roomCreateLimiter = new RateLimiter(40, 60_000);
export const globalRoomCreateLimiter = new RateLimiter(300, 60_000);

/**
 * Hall burst: 500 people on one NAT (school Wi-Fi) joining and opening the
 * live stream inside 10 seconds. Per-IP caps must not be smaller than that.
 * Room capacity (`maxParticipants`) is still the seat limit.
 */
export const joinLimiter = new RateLimiter(600, 10_000);
export const joinAttemptLimiter = new RateLimiter(800, 10_000);
export const globalJoinAttemptLimiter = new RateLimiter(8_000, 60_000);

/** Public snapshots: a full room refreshing after a flaky reconnect. */
export const publicReadLimiter = new RateLimiter(800, 15_000);

/** Presence leases: 20s client cadence, plus a join wave. */
export const presenceLimiter = new RateLimiter(800, 15_000);

/** Responses: 12 per participant per 10 s (answer changes still easy). */
export const responseLimiter = new RateLimiter(12, 10_000);

/** Repeated-input mode: four taps/second with a small burst allowance. */
export const crowdMeterLimiter = new RateLimiter(20, 5_000);

/** Reactions: per-person fairness plus a high room-level safety ceiling. */
export const reactionParticipantLimiter = new RateLimiter(4, 2_000);
export const reactionRoomLimiter = new RateLimiter(240, 1_000);

/** SSE opens: one per tab, plus reconnects, from a shared public IP. */
export const eventStreamLimiter = new RateLimiter(800, 15_000);

/**
 * Host commands: authenticated, but a buggy host client or leaked token must
 * not hammer transitions/moderation/settings unbounded. Generous — a host
 * toggling settings and running rounds never feels this.
 */
export const hostCommandLimiter = new RateLimiter(120, 60_000);

/** Players plus stage, host, presenter, and a reconnect overlap. */
export const MAX_EVENT_SUBSCRIBERS_PER_ROOM = 800;
export const MAX_EVENT_SUBSCRIBERS_GLOBAL = 4_000;

const ALL_LIMITERS = [
  roomCreateLimiter,
  globalRoomCreateLimiter,
  joinLimiter,
  joinAttemptLimiter,
  globalJoinAttemptLimiter,
  publicReadLimiter,
  presenceLimiter,
  responseLimiter,
  crowdMeterLimiter,
  reactionParticipantLimiter,
  reactionRoomLimiter,
  eventStreamLimiter,
  hostCommandLimiter,
];

/** Drop in-memory windows so a 500-join burst test cannot starve later cases. */
export function resetRateLimitersForTests() {
  for (const limiter of ALL_LIMITERS) limiter.clear();
}
