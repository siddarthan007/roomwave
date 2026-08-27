// ---------------------------------------------------------------------------
// Ephemeral reaction hub.
//
// Reactions are NOT persisted. They are sampled into bursts so that a
// 300-person crowd produces a handful of SSE events per second, not
// hundreds. Buckets give clients dedupe keys.
// ---------------------------------------------------------------------------

import type { ReactionKind } from "@roomwave/shared";

import { roomHub } from "../realtime/room-hub";

/** Quiet rooms flush on the next frame so every screen paints with the tap. */
const LEADING_MS = 16;
/** Hard cap of reaction units represented per bucket per kind. */
const MAX_BURST = 24;

interface Bucket {
  counts: Map<ReactionKind, number>;
  timer: ReturnType<typeof setTimeout> | null;
  id: number;
}

let bucketCounter = 0;

export class ReactionHub {
  private rooms = new Map<string, Bucket>();

  add(roomId: string, kind: ReactionKind, weight = 1) {
    const existing = this.rooms.get(roomId);
    if (existing?.timer) {
      existing.counts.set(
        kind,
        Math.min(MAX_BURST, (existing.counts.get(kind) ?? 0) + weight),
      );
      return;
    }

    bucketCounter += 1;
    const bucket: Bucket = {
      counts: new Map([[kind, Math.min(MAX_BURST, weight)]]),
      timer: null,
      id: bucketCounter,
    };
    bucket.timer = setTimeout(() => this.tick(roomId), LEADING_MS);
    bucket.timer.unref?.();
    this.rooms.set(roomId, bucket);
  }

  private tick(roomId: string) {
    const bucket = this.rooms.get(roomId);
    if (!bucket) return;
    bucket.timer = null;
    this.rooms.delete(roomId);
    this.flush(roomId, bucket);
  }

  private flush(roomId: string, bucket: Bucket) {
    for (const [kind, count] of bucket.counts) {
      if (count <= 0) continue;
      roomHub.publish(roomId, {
        type: "reactions",
        roomId,
        burst: { kind, count, bucket: bucket.id },
      });
    }
  }

  /** Cancel pending bursts so a deleted room cannot republish. */
  forget(roomId: string) {
    const bucket = this.rooms.get(roomId);
    if (!bucket) return;
    if (bucket.timer) clearTimeout(bucket.timer);
    this.rooms.delete(roomId);
  }
}

export const reactionHub = new ReactionHub();
export const REACTION_LEADING_MS = LEADING_MS;
