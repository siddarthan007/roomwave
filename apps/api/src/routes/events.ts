import type { RoomEvent } from "@roomwave/shared";
import { Hono } from "hono";

import type { AppEnv } from "../lib/app-env";
import { remoteClientKey } from "../lib/app-env";
import {
  eventStreamLimiter,
  MAX_EVENT_SUBSCRIBERS_GLOBAL,
  MAX_EVENT_SUBSCRIBERS_PER_ROOM,
} from "../lib/rate-limit";
import { expireStaleRooms } from "../lib/room-expiry";
import { roomHub } from "../realtime/room-hub";
import { assignSequence, eventsAfter } from "../realtime/event-sequence";
import { getRoomState } from "../services/room-state";

export const eventRoutes = new Hono<AppEnv>();

/** A silently-dead TCP peer holds a subscriber slot forever without this. */
const MAX_CONNECTION_MS = 30 * 60_000; // 30 minutes, then the client reconnects.

function encodeSse(
  encoder: TextEncoder,
  event: string,
  data: unknown,
  options: { id?: string; retry?: number } = {},
): Uint8Array {
  const fields = [
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    options.id ? `id: ${options.id}` : null,
    options.retry ? `retry: ${options.retry}` : null,
  ].filter(Boolean);
  return encoder.encode(`${fields.join("\n")}\n\n`);
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

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        let active = true;
        let heartbeat: ReturnType<typeof setInterval>;
        let lifetime: ReturnType<typeof setTimeout>;
        let unsubscribe = () => {};

        const close = () => {
          if (!active) return;
          active = false;
          unsubscribe();
          clearInterval(heartbeat);
          clearTimeout(lifetime);
          c.req.raw.signal.removeEventListener("abort", close);
          try {
            controller.close();
          } catch {
            // The consumer may already have cancelled the stream.
          }
        };
        const write = (
          event: RoomEvent,
          seq: number,
          extra: { retry?: number } = {},
        ): boolean => {
          // desiredSize falls below zero when a client is not draining. Give
          // a short burst budget, then evict instead of buffering unbounded.
          if (controller.desiredSize != null && controller.desiredSize <= -16) {
            return false;
          }
          try {
            controller.enqueue(
              encodeSse(encoder, event.type, event, {
                id: String(seq),
                retry: extra.retry,
              }),
            );
            return true;
          } catch {
            return false;
          }
        };

        unsubscribe = roomHub.subscribe(roomId, (event, seq) => {
          if (!active) return;
          if (!write(event, seq)) close();
        });
        heartbeat = setInterval(() => {
          if (!active) return;
          if (controller.desiredSize != null && controller.desiredSize <= -16) {
            close();
            return;
          }
          try {
            controller.enqueue(encodeSse(encoder, "heartbeat", {}));
          } catch {
            close();
          }
        }, 5_000);
        // Zombie eviction: heartbeats can keep "succeeding" into a dead OS
        // buffer indefinitely, so cap every connection's lifetime and let the
        // client's auto-reconnect (with its last event id) take over.
        lifetime = setTimeout(close, MAX_CONNECTION_MS);
        lifetime.unref?.();
        c.req.raw.signal.addEventListener("abort", close, { once: true });
        cleanup = close;

        // Snapshot is computed AFTER subscribing: any mutation that lands
        // between subscribe and this read arrives as both a duplicate event
        // and inside the snapshot — safe — whereas the reverse order loses it.
        const freshState = getRoomState(roomId);
        if (!freshState) {
          const snapshotSeq = assignSequence(roomId, {
            type: "room.snapshot",
            state: exists,
          });
          if (!write({ type: "room.snapshot", state: exists }, snapshotSeq)) {
            close();
          }
          return;
        }
        const snapshotEvent = { type: "room.snapshot" as const, state: freshState };
        const snapshotSeq = assignSequence(roomId, snapshotEvent);
        if (!write(snapshotEvent, snapshotSeq, { retry: 2_000 })) {
          close();
          return;
        }
        // Replay anything missed while disconnected — best-effort deltas on
        // top of the authoritative snapshot; skipped when the gap predates
        // the replay window.
        if (Number.isFinite(resumeAfter) && resumeAfter > 0) {
          for (const { seq, event } of eventsAfter(roomId, resumeAfter)) {
            if (!active) break;
            if (!write(event, seq)) {
              close();
              break;
            }
          }
        }
      },
      cancel() {
        cleanup();
      },
    },
    { highWaterMark: 16 },
  );

  c.header("Cache-Control", "no-cache, no-transform");
  c.header("Connection", "keep-alive");
  c.header("Content-Type", "text/event-stream; charset=UTF-8");
  c.header("X-Accel-Buffering", "no");
  return c.body(body);
});
