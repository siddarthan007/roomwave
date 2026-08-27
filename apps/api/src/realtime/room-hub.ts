import type { RoomEvent } from "@roomwave/shared";

import { assignSequence } from "./event-sequence";
import { encodeSse } from "./sse-encode";

type Listener = (
  event: RoomEvent,
  seq: number,
  encoded: Uint8Array,
) => void | Promise<void>;

class RoomHub {
  private rooms = new Map<string, Set<Listener>>();

  subscribe(roomId: string, listener: Listener) {
    let listeners = this.rooms.get(roomId);
    if (!listeners) {
      listeners = new Set<Listener>();
      this.rooms.set(roomId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        this.rooms.delete(roomId);
      }
    };
  }

  publish(roomId: string, event: RoomEvent) {
    // Sequence centrally so ids are identical for every subscriber and events
    // published with zero listeners still advance the counter (otherwise a
    // reconnecting client's `after` would collide with the snapshot id).
    const seq = assignSequence(roomId, event);
    const listeners = this.rooms.get(roomId);
    if (!listeners) return seq;

    // Encode once. A 500-seat room must not JSON.stringify the same aggregate
    // 500 times on every coalesced flush.
    const encoded = encodeSse(event.type, event, { id: String(seq) });

    for (const listener of listeners) {
      try {
        const result = listener(event, seq, encoded);
        if (result && typeof result.then === "function") {
          result.catch((error) => {
            console.error("RoomHub listener error", error);
          });
        }
      } catch (error) {
        console.error("RoomHub listener error", error);
      }
    }
    return seq;
  }

  /** Read-only observability hook used by connection tests and local metrics. */
  subscriberCount(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  totalSubscriberCount(): number {
    let total = 0;
    for (const listeners of this.rooms.values()) total += listeners.size;
    return total;
  }

  /** Drop live listeners for a room that no longer exists. */
  drop(roomId: string) {
    this.rooms.delete(roomId);
  }
}

export const roomHub = new RoomHub();
