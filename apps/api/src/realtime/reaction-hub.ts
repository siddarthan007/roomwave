// ---------------------------------------------------------------------------
// Ephemeral reaction hub.
//
// Reactions are NOT persisted. They are sampled into bursts so that a
// 300-person crowd produces a handful of SSE events per second, not
// hundreds. Buckets give clients dedupe keys.
// ---------------------------------------------------------------------------

import type { ReactionKind } from "@roomwave/shared";

import { roomHub } from "../realtime/room-hub";

const BUCKET_MS = 280;
/** Hard cap of reaction units represented per bucket per kind. */
const MAX_BURST = 24;

interface Bucket {
  counts: Map<ReactionKind, number>;
  timer: ReturnType<typeof setTimeout> | null;
  id: number;
}

let bucketCounter = 0;

export class ReactionHub {
  private rooms = new Map<string, Bucket[]>();

  add(roomId: string, kind: ReactionKind, weight = 1) {
    let buckets = this.rooms.get(roomId);
    if (!buckets) {
      buckets = [];
      this.rooms.set(roomId, buckets);
    }

    let bucket = buckets.find((candidate) => candidate.timer !== null);
    if (!bucket) {
      bucketCounter += 1;
      bucket = {
        counts: new Map(),
        timer: null,
        id: bucketCounter,
      };
      buckets.push(bucket);

      bucket.timer = setTimeout(() => {
        bucket!.timer = null;
        this.flush(roomId, bucket!);
        // Drop closed buckets.
        const remaining = (this.rooms.get(roomId) ?? []).filter(
          (candidate) => candidate.timer !== null,
        );
        if (remaining.length === 0) this.rooms.delete(roomId);
      }, BUCKET_MS);
    }

    bucket.counts.set(kind, Math.min(MAX_BURST, (bucket.counts.get(kind) ?? 0) + weight));
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
    const buckets = this.rooms.get(roomId);
    if (!buckets) return;
    for (const bucket of buckets) {
      if (bucket.timer) clearTimeout(bucket.timer);
    }
    this.rooms.delete(roomId);
  }
}

export const reactionHub = new ReactionHub();
