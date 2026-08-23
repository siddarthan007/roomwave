import type { RoomEvent } from "@roomwave/shared";

import { useEffect, useRef, useState } from "react";

import { apiUrl } from "../lib/api";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting";

const EVENT_NAMES: RoomEvent["type"][] = [
  "room.snapshot",
  "activity.started",
  "activity.state",
  "response.created",
  "aggregate.updated",
  "participant.count",
  "presence.changed",
  "reactions",
];

/**
 * SSE room stream. On reconnect the server re-sends a fresh canonical
 * snapshot first, so clients never depend on event replay for correctness.
 */
export function useRoomStream(
  roomId: string,
  onEvent: (event: RoomEvent) => void,
  enabled = true,
): ConnectionState {
  const callbackRef = useRef(onEvent);
  const [connection, setConnection] = useState<{
    roomId: string;
    state: ConnectionState;
  }>({ roomId, state: "connecting" });

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!roomId || !enabled) return;

    let stopped = false;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let retryDelay = 1_000;

    const connect = () => {
      if (stopped) return;
      source = new EventSource(apiUrl(`/api/rooms/${roomId}/events`));

      source.onopen = () => {
        retryDelay = 1_000;
        setConnection({ roomId, state: "connected" });
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (stopped) return;
        setConnection({ roomId, state: "reconnecting" });
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      };

      for (const name of EVENT_NAMES) {
        source.addEventListener(name, (rawEvent) => {
          const message = rawEvent as MessageEvent;
          try {
            callbackRef.current(JSON.parse(message.data) as RoomEvent);
          } catch (error) {
            console.error("Invalid SSE event", error);
          }
        });
      }
    };

    connect();

    return () => {
      stopped = true;
      source?.close();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [enabled, roomId]);

  return enabled && connection.roomId === roomId
    ? connection.state
    : "connecting";
}
