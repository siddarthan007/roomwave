import type { PublicParticipant } from "@roomwave/shared";

import { roomHub } from "./room-hub";

const PRESENCE_TTL_MS = 45_000;
const PRESENCE_LIST_LIMIT = 48;

interface PresenceEntry extends PublicParticipant {
  lastSeen: number;
}

class PresenceHub {
  private rooms = new Map<string, Map<string, PresenceEntry>>();
  private visibility = new Map<string, boolean>();
  // Dirty-room coalescing (~350ms window, per ARCHITECTURE-ESSENTIALS §9.4):
  // burst input must not produce one broadcast per event. A 500-person room
  // voting at once otherwise fans out hundreds of full-presence payloads.
  private dirtyTimers = new Map<string, ReturnType<typeof setTimeout>>();

  touch(
    roomId: string,
    participant: PublicParticipant,
    showParticipants: boolean,
    now = Date.now(),
    options: { immediate?: boolean } = {},
  ) {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }
    room.set(participant.id, { ...participant, lastSeen: now });
    this.visibility.set(roomId, showParticipants);
    if (options.immediate) {
      this.cancelScheduled(roomId);
      this.publish(roomId, now);
      return;
    }
    // Default path: coalesce. Burst call sites (responses/reactions) rely on
    // this so a 500-person voting burst cannot fan out one broadcast each.
    this.schedulePublish(roomId);
  }

  private schedulePublish(roomId: string) {
    if (this.dirtyTimers.has(roomId)) return;
    const timer = setTimeout(() => {
      this.dirtyTimers.delete(roomId);
      this.publish(roomId);
    }, 350);
    timer.unref?.();
    this.dirtyTimers.set(roomId, timer);
  }

  private cancelScheduled(roomId: string) {
    const timer = this.dirtyTimers.get(roomId);
    if (timer) clearTimeout(timer);
    this.dirtyTimers.delete(roomId);
  }

  snapshot(roomId: string, showParticipants: boolean, now = Date.now()) {
    this.visibility.set(roomId, showParticipants);
    const room = this.rooms.get(roomId);
    if (!room) return { onlineCount: 0, participants: [] as PublicParticipant[] };
    this.pruneRoom(roomId, room, now);
    const active = [...room.values()].sort(
      (a, b) => b.lastSeen - a.lastSeen || a.displayName.localeCompare(b.displayName),
    );
    return {
      onlineCount: active.length,
      participants: showParticipants
        ? active.slice(0, PRESENCE_LIST_LIMIT).map(({ lastSeen: _lastSeen, ...entry }) => entry)
        : [],
    };
  }

  private pruneRoom(roomId: string, room: Map<string, PresenceEntry>, now: number) {
    for (const [participantId, entry] of room) {
      if (now - entry.lastSeen >= PRESENCE_TTL_MS) room.delete(participantId);
    }
    if (room.size === 0) {
      this.rooms.delete(roomId);
      // Otherwise one boolean per room accumulates forever on a long-lived server.
      this.visibility.delete(roomId);
    }
  }

  /** Test/observability hook: flush any pending coalesced publish now. */
  flushScheduled(roomId: string) {
    if (!this.dirtyTimers.has(roomId)) return;
    this.cancelScheduled(roomId);
    this.publish(roomId);
  }

  private publish(roomId: string, now = Date.now()) {
    const snapshot = this.snapshot(roomId, this.visibility.get(roomId) !== false, now);
    roomHub.publish(roomId, {
      type: "presence.changed",
      roomId,
      onlineCount: snapshot.onlineCount,
      participants: snapshot.participants,
    });
  }

  sweep(now = Date.now()) {
    for (const [roomId, room] of this.rooms) {
      const before = room.size;
      this.pruneRoom(roomId, room, now);
      if (before !== (this.rooms.get(roomId)?.size ?? 0)) this.publish(roomId, now);
    }
  }
}

export const presenceHub = new PresenceHub();

const presenceSweep = setInterval(() => presenceHub.sweep(), 10_000);
presenceSweep.unref?.();
