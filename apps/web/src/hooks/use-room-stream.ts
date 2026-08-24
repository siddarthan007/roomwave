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
 * The last seen server sequence is echoed back via `?after=` so the server
 * can also replay the events missed while the socket was down (best effort —
 * gaps older than the replay window are covered by the snapshot alone).
 *
 * Liveness hardening:
 *  - watchdog timer: if no SSE event (heartbeat included) arrives within
 *    HEARTBEAT_TIMEOUT, force-reconnect. Catches half-open connections where
 *    the socket looks alive but events silently stop (NAT drops, proxy idle
 *    eviction). This is the main cause of "updates only arrive after a tab
 *    switch".
 *  - visibilitychange: browsers throttle timers in background tabs and may
 *    suspend the connection; on return to foreground we reconnect immediately
 *    (with ?after= replay) instead of waiting out the backoff timer.
 */
export function useRoomStream(
  roomId: string,
  onEvent: (event: RoomEvent) => void,
  enabled = true,
): ConnectionState {
  const callbackRef = useRef(onEvent);
  const lastEventIdRef = useRef(0);
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
    let watchdogTimer: number | null = null;
    let retryDelay = 1_000;

    // Server heartbeats every 5s. Two intervals of silence means the pipe is
    // dead even if the socket has not errored yet.
    const HEARTBEAT_TIMEOUT_MS = 11_000;

    const armWatchdog = () => {
      if (watchdogTimer !== null) window.clearTimeout(watchdogTimer);
      watchdogTimer = window.setTimeout(() => {
        if (stopped) return;
        // Half-open connection: close and reconnect with replay.
        source?.close();
        source = null;
        setConnection({ roomId, state: "reconnecting" });
        connect();
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const connect = () => {
      if (stopped) return;
      const after = lastEventIdRef.current;
      const url = apiUrl(
        after > 0
          ? `/api/rooms/${roomId}/events?after=${after}`
          : `/api/rooms/${roomId}/events`,
      );
      source = new EventSource(url);

      source.onopen = () => {
        retryDelay = 1_000;
        armWatchdog();
        setConnection({ roomId, state: "connected" });
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (watchdogTimer !== null) window.clearTimeout(watchdogTimer);
        if (stopped) return;
        setConnection({ roomId, state: "reconnecting" });
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      };

      for (const name of EVENT_NAMES) {
        source.addEventListener(name, (rawEvent) => {
          const message = rawEvent as MessageEvent;
          const parsedId = Number.parseInt(message.lastEventId ?? "", 10);
          if (Number.isFinite(parsedId)) {
            lastEventIdRef.current = parsedId;
          }
          armWatchdog();
          try {
            callbackRef.current(JSON.parse(message.data) as RoomEvent);
          } catch (error) {
            console.error("Invalid SSE event", error);
          }
        });
      }
    };

    connect();

    // Returning to the tab: timers were throttled, the connection may have
    // died silently. Reconnect right away; ?after= replays what was missed.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      if (!source || source.readyState === EventSource.CLOSED) {
        if (retryTimer !== null) window.clearTimeout(retryTimer);
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      source?.close();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (watchdogTimer !== null) window.clearTimeout(watchdogTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, roomId]);

  return enabled && connection.roomId === roomId
    ? connection.state
    : "connecting";
}
