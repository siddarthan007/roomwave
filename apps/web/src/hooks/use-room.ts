import type {
  ReactionBurst,
  RoomEvent,
  RoomState,
} from "@roomwave/shared";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRoomStream } from "./use-room-stream";
import { getRoomState } from "../lib/api";

/**
 * Canonical room state + ephemeral channels.
 * Aggregate events patch state in place; structural changes refetch.
 * `arrival` increments per arriving response and drives counter pulses.
 */
export function useRoom(roomId: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [burst, setBurst] = useState<ReactionBurst | null>(null);
  const [arrival, setArrival] = useState(0);
  const [error, setError] = useState("");
  // Only the newest snapshot request may land: rapid activity.started →
  // activity.state events would otherwise resolve out of order and briefly
  // revert the visible phase with a stale snapshot.
  const fetchSeq = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    if (!roomId) return Promise.resolve();
    const seq = ++fetchSeq.current;
    return getRoomState(roomId)
      .then((next) => {
        if (!mountedRef.current || seq !== fetchSeq.current) return;
        setError("");
        setState(next);
      })
      .catch((caught) => {
        if (!mountedRef.current || seq !== fetchSeq.current) return;
        setError(caught instanceof Error ? caught.message : "Room unavailable.");
      });
  }, [roomId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const handleEvent = useCallback(
    (event: RoomEvent) => {
      switch (event.type) {
        case "room.snapshot":
          setState(event.state);
          break;

        case "aggregate.updated":
          setState((current) =>
            current && current.activity?.id === event.activityId
              ? {
                  ...current,
                  aggregate: event.aggregate,
                  responseCount: event.responseCount,
                  momentum: event.momentum,
                }
              : current,
          );
          break;

        case "response.created":
          setArrival((tick) => tick + 1);
          break;

        case "activity.started":
        case "activity.state":
          // Structural change: pull a fresh authoritative snapshot.
          void refresh();
          break;

        case "participant.count":
          setState((current) =>
            current ? { ...current, participantCount: event.count } : current,
          );
          break;

        case "presence.changed":
          setState((current) =>
            current
              ? {
                  ...current,
                  onlineCount: event.onlineCount,
                  presence: event.participants,
                }
              : current,
          );
          break;

        case "reactions":
          setBurst({ ...event.burst });
          break;

        default:
          break;
      }
    },
    [refresh],
  );

  const connection = useRoomStream(
    roomId,
    handleEvent,
    Boolean(state && state.room.id === roomId),
  );

  // Safety-net polling only while the live stream is NOT healthy: while SSE
  // is connected a poll could interleave a stale HTTP snapshot between fresh
  // patches. The boolean keeps this effect from restarting on every patch.
  const streamReady = Boolean(state && state.room.id === roomId);
  useEffect(() => {
    if (!roomId || !streamReady || connection === "connected") return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [connection, refresh, roomId, streamReady]);

  return { state, setState, burst, arrival, connection, error };
}
