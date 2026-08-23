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
import { getRoomState } from "../services/room-state";

export const eventRoutes = new Hono<AppEnv>();

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
  const state = getRoomState(roomId);
  if (!state) {
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

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        let active = true;
        let heartbeat: ReturnType<typeof setInterval>;
        let unsubscribe = () => {};

        const close = () => {
          if (!active) return;
          active = false;
          unsubscribe();
          clearInterval(heartbeat);
          c.req.raw.signal.removeEventListener("abort", close);
          try {
            controller.close();
          } catch {
            // The consumer may already have cancelled the stream.
          }
        };
        const send = (event: RoomEvent) => {
          if (!active) return;
          // desiredSize falls below zero when a client is not draining. Give a
          // short burst budget, then evict instead of retaining unbounded data.
          if (controller.desiredSize != null && controller.desiredSize <= -16) {
            close();
            return;
          }
          try {
            controller.enqueue(
              encodeSse(encoder, event.type, event, {
                id: crypto.randomUUID(),
              }),
            );
          } catch {
            close();
          }
        };

        unsubscribe = roomHub.subscribe(roomId, send);
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
        c.req.raw.signal.addEventListener("abort", close, { once: true });
        cleanup = close;
        controller.enqueue(
          encodeSse(
            encoder,
            "room.snapshot",
            { type: "room.snapshot", state },
            { id: crypto.randomUUID(), retry: 2_000 },
          ),
        );
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
