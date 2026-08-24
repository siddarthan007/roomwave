// ---------------------------------------------------------------------------
// Per-room event sequencing + replay ring buffer.
//
// RoomHub.assignSequence() records every published event under a monotonic
// sequence BEFORE fan-out, so ids are consistent for every subscriber and
// events published while nobody listens still advance the counter. The most
// recent REPLAY_WINDOW events per room back Last-Event-ID resume support:
// reconnecting clients replay what they missed (best-effort deltas on top of
// an authoritative snapshot, never a replacement for it).
// ---------------------------------------------------------------------------

import type { RoomEvent } from "@roomwave/shared";

const REPLAY_WINDOW = 300;

export interface SequencedEvent {
  seq: number;
  event: RoomEvent;
}

const buffers = new Map<string, SequencedEvent[]>();
const counters = new Map<string, number>();

/**
 * Assign the next monotonic sequence for the room and buffer the event for
 * replay. Called exactly once per published event, by RoomHub.publish.
 */
export function assignSequence(roomId: string, event: RoomEvent): number {
  const counter = (counters.get(roomId) ?? 0) + 1;
  counters.set(roomId, counter);

  let buffer = buffers.get(roomId);
  if (!buffer) {
    buffer = [];
    buffers.set(roomId, buffer);
  }
  buffer.push({ seq: counter, event });
  if (buffer.length > REPLAY_WINDOW) {
    buffer.splice(0, buffer.length - REPLAY_WINDOW);
  }
  return counter;
}

/** Events with seq strictly greater than `after`, oldest first. */
export function eventsAfter(
  roomId: string,
  after: number,
): SequencedEvent[] {
  const buffer = buffers.get(roomId);
  if (!buffer || buffer.length === 0) return [];
  // A gap older than the retained window cannot be filled faithfully; the
  // fresh snapshot alone covers the client (partial history would be wrong).
  if (after < buffer[0].seq - 1) return [];
  return buffer.filter(({ seq }) => seq > after);
}

/** Drop sequencing state for rooms that no longer exist. */
export function releaseRoomSequences(roomId: string): void {
  buffers.delete(roomId);
  counters.delete(roomId);
}
