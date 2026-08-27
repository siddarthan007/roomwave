import type { RoomEvent } from "@roomwave/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { AppContext, AppEnv } from "../lib/app-env";
import { remoteClientKey } from "../lib/app-env";
import {
  eventStreamLimiter,
  MAX_EVENT_SUBSCRIBERS_GLOBAL,
  MAX_EVENT_SUBSCRIBERS_PER_ROOM,
} from "../lib/rate-limit";
import { expireStaleRooms } from "../lib/room-expiry";
import { roomHub } from "../realtime/room-hub";
import { encodeSse } from "../realtime/sse-encode";
import { assignSequence, eventsAfter } from "../realtime/event-sequence";
import { getRoomState } from "../services/room-state";

export const eventRoutes = new Hono<AppEnv>();

/** A silently-dead TCP peer holds a subscriber slot forever without this. */
const MAX_CONNECTION_MS = 30 * 60_000; // 30 minutes, then the client reconnects.
/** Evict a client that is not draining rather than buffer unbounded. */
const MAX_PENDING_FRAMES = 24;

function keepSseAlive(c: AppContext) {
  // Bun.serve closes quiet streams after 10s unless this request's idle
  // timer is disabled. Tests and non-Bun adapters have no server handle.
  try {
    c.env?.bunServer?.timeout(c.req.raw, 0);
  } catch {
    // Ignore missing timeout support.
  }
}

eventRoutes.get("/:roomId/events", (c) => {
  const roomId = c.req.param("roomId");
  expireStaleRooms();
  const exists = getRoomState(roomId);
  if (!exists) {
    return c.json(
      { error: { code: "ROOM_NOT_FOUND", message: "Room not found." } },
      404,
    );
  }

  if (
    roomHub.subscriberCount(roomId) >= MAX_EVENT_SUBSCRIBERS_PER_ROOM ||
    roomHub.totalSubscriberCount() >= MAX_EVENT_SUBSCRIBERS_GLOBAL ||
    !eventStreamLimiter.allow(`${remoteClientKey(c)}:${roomId}`)
  ) {
    return c.json(
      {
        error: {
          code: "STREAM_LIMIT_REACHED",
          message: "This room has too many live connections. Reconnect shortly.",
        },
      },
      429,
    );
  }

  // Resume support: browsers echo the last received `id:` automatically via
  // this header on native reconnection. Manual reconnects (our client closes
  // and reopens on error, resetting EventSource state) pass `?after=`.
  const resumeRaw =
    c.req.header("Last-Event-ID") ?? c.req.query("after") ?? "";
  const resumeAfter = Number.parseInt(resumeRaw, 10);

  keepSseAlive(c);
  c.header("Cache-Control", "no-cache, no-store, no-transform");
  c.header("X-Accel-Buffering", "no");
  c.header("Content-Encoding", "identity");

  return streamSSE(c, async (stream) => {
    let active = true;
    let unsubscribe = () => {};
    let writeChain = Promise.resolve();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let lifetime: ReturnType<typeof setTimeout> | undefined;

    let pendingFrames = 0;

    const close = () => {
      if (!active) return;
      active = false;
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
      if (lifetime) clearTimeout(lifetime);
    };

    const enqueue = (bytes: Uint8Array) => {
      if (!active) return writeChain;
      if (pendingFrames >= MAX_PENDING_FRAMES) {
        close();
        return writeChain;
      }
      pendingFrames += 1;
      writeChain = writeChain
        .then(async () => {
          pendingFrames = Math.max(0, pendingFrames - 1);
          if (!active || stream.closed) return;
          await stream.write(bytes);
        })
        .catch(close);
      return writeChain;
    };

    const writeEvent = (
      event: RoomEvent,
      seq: number,
      extra: { retry?: number } = {},
    ) =>
      enqueue(
        encodeSse(event.type, event, {
          id: String(seq),
          retry: extra.retry,
        }),
      );

    unsubscribe = roomHub.subscribe(roomId, (_event, _seq, encoded) => {
      void enqueue(encoded);
    });

    heartbeat = setInterval(() => {
      void enqueue(encodeSse("heartbeat", {}));
    }, 5_000);
    heartbeat.unref?.();

    stream.onAbort(close);
    c.req.raw.signal.addEventListener("abort", close, { once: true });

    // Snapshot is computed AFTER subscribing: any mutation that lands
    // between subscribe and this read arrives as both a duplicate event
    // and inside the snapshot — safe — whereas the reverse order loses it.
    const freshState = getRoomState(roomId);
    const snapshotEvent = {
      type: "room.snapshot" as const,
      state: freshState ?? exists,
    };
    const snapshotSeq = assignSequence(roomId, snapshotEvent);
    await writeEvent(snapshotEvent, snapshotSeq, { retry: 2_000 });

    if (Number.isFinite(resumeAfter) && resumeAfter > 0) {
      for (const { seq, event } of eventsAfter(roomId, resumeAfter)) {
        if (!active) break;
        await writeEvent(event, seq);
      }
    }

    await new Promise<void>((resolve) => {
      const finish = () => {
        close();
        resolve();
      };
      if (!active) {
        resolve();
        return;
      }
      stream.onAbort(finish);
      c.req.raw.signal.addEventListener("abort", finish, { once: true });
      lifetime = setTimeout(finish, MAX_CONNECTION_MS);
      lifetime.unref?.();
    });
  });
});
