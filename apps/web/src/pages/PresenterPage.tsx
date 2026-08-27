import type { ActivityState } from "@roomwave/shared";
import { activityRequiresReveal } from "@roomwave/shared";

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";

import {
  activityAction,
  createActivity,
  getRoomState,
  type CreateActivityPayload,
} from "../lib/api";
import { getHostToken } from "../lib/storage";
import { loadPlaylist, savePlaylist, subscribePlaylist, type PlaylistEntry } from "../lib/playlist";
import { Kicker } from "../components/ui";
import { useRoomStream } from "../hooks/use-room-stream";

/**
 * Presenter remote: a one-handed, big-target host surface for walking a room.
 * Mirrors HostPage actions (lock / reveal / next-from-queue) with live counts,
 * sized for thumbs and readable at arm's length. No editing here by design —
 * the studio (HostPage) remains the composer; this is the stage clicker.
 */
export function PresenterPage() {
  const { roomId } = useParams();
  const [state, setState] = useState<Awaited<ReturnType<typeof getRoomState>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Lazy init: the run-of-show is host-local storage, read once at mount.
  const [playlist, setPlaylist] = useState<PlaylistEntry[]>(() =>
    roomId ? loadPlaylist(roomId) : [],
  );
  useEffect(() => {
    if (!roomId) return;
    return subscribePlaylist(roomId, setPlaylist);
  }, [roomId]);
  const hostToken = getHostToken(roomId ?? "");

  useEffect(() => {
    if (!roomId) return;
    let active = true;
    const load = () =>
      getRoomState(roomId)
        .then((next) => {
          if (active) setState(next);
        })
        .catch(() => null);
    void load();
    const timer = window.setInterval(load, 4_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [roomId]);

  const activity = state?.activity ?? null;
  const phase: ActivityState | "lobby" = activity?.state ?? "lobby";

  const canLock = phase === "live" && Boolean(hostToken) && !busy;
  const canReveal =
    phase === "locked" &&
    Boolean(activity && activityRequiresReveal(activity.config)) &&
    Boolean(hostToken) &&
    !busy;
  const nextEntry = playlist[0];

  async function act(action: "lock" | "reveal" | "end") {
    if (!activity || !hostToken || busy) return;
    setBusy(true);
    setError("");
    try {
      await activityAction(activity.id, action, hostToken);
      setState(await getRoomState(roomId ?? ""));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command failed.");
    } finally {
      setBusy(false);
    }
  }

  async function launchNext() {
    if (!roomId || !hostToken || !nextEntry || busy) return;
    setBusy(true);
    setError("");
    try {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(nextEntry.configJson) as Record<string, unknown>;
      } catch {
        setError("This queued round is damaged. Remove it in the studio.");
        return;
      }
      // End the finished round first so the room accepts a new activity.
      if (activity && activity.state !== "ended") {
        await activityAction(activity.id, "end", hostToken);
      }
      const payload = {
        type: nextEntry.type,
        prompt: nextEntry.prompt,
        ...config,
      } as CreateActivityPayload;
      const created = await createActivity(roomId, hostToken, payload);
      await activityAction(created.id, "start", hostToken);
      const remaining = playlist.slice(1);
      setPlaylist(remaining);
      savePlaylist(roomId, remaining);
      setState(await getRoomState(roomId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Launch failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Live counts ride the same SSE stream as every other surface; polling in
  // the effect above is only a fallback when this tab is backgrounded.
  useRoomStream(state?.room.id ?? "", (event) => {
    if (
      event.type === "aggregate.updated" ||
      event.type === "participant.count" ||
      event.type === "activity.state" ||
      event.type === "activity.started" ||
      event.type === "room.snapshot"
    ) {
      if (roomId) void getRoomState(roomId).then(setState).catch(() => null);
    }
  }, Boolean(state));

  const responseCount = state?.responseCount ?? 0;
  const participantCount = state?.participantCount ?? 0;
  const phaseColor = useMemo(() => {
    switch (phase) {
      case "live":
        return "var(--green)";
      case "revealed":
        return "var(--red)";
      case "locked":
        return "var(--yellow)";
      default:
        return "var(--paper-deep)";
    }
  }, [phase]);

  if (!hostToken) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <Kicker color="var(--red)">presenter remote</Kicker>
          <p className="mt-4 text-lg font-bold">
            Open this from the host studio. It uses your host key.
          </p>
          <Link
            to={roomId ? `/host/${roomId}` : "/"}
            className="mono-tag mt-6 inline-block border-2 border-[var(--ink)] bg-[var(--yellow)] px-4 py-2"
          >
            go to studio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      id="roomwave-main"
      className="safe-page safe-gutters page-pad mx-auto flex min-h-dvh max-w-md flex-col"
      data-room-theme={state?.room.settings.theme}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Kicker color="var(--red)">remote</Kicker>
          <p className="mt-1 truncate text-xl font-black">
            {state?.room.title ?? "…"}
          </p>
        </div>
        <span className="mono-tag shrink-0 text-[var(--ink-soft)]">
          {state ? state.room.code : "···"}
        </span>
      </header>

      <section
        aria-live="polite"
        className="mt-6 border-2 border-[var(--ink)] p-5 block-shadow"
        style={{ background: phaseColor }}
      >
        <p className="mono-tag">{phase.toUpperCase()}</p>
        <p className="display mt-2 text-2xl leading-tight">
          {activity?.prompt ?? state?.room.settings.lobbyMessage ?? "Lobby"}
        </p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <p className="display text-6xl tabular-nums">{responseCount}</p>
          <p className="mono-tag text-right">
            answers in<br />
            {participantCount} joined
          </p>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => void act("lock")}
          disabled={!canLock}
          className="block-shadow flex min-h-24 items-center justify-center border-4 border-[var(--ink)]
            bg-[var(--paper)] px-2 text-center text-xl font-black uppercase leading-tight tracking-wide transition-transform
            active:scale-95 disabled:opacity-35 sm:min-h-28 sm:text-2xl"
        >
          lock
        </button>
        <motion.button
          type="button"
          onClick={() => void act("reveal")}
          disabled={!canReveal}
          whileTap={canReveal ? { scale: 0.96 } : undefined}
          className="block-shadow flex min-h-24 items-center justify-center border-4 border-[var(--ink)]
            bg-[var(--yellow)] px-2 text-center text-xl font-black uppercase leading-tight tracking-wide
            disabled:opacity-35 sm:min-h-28 sm:text-2xl"
        >
          reveal
        </motion.button>
      </div>

      {activity && phase !== "ended" && phase !== "lobby" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm("End this round and return the room to its lobby?")) {
              void act("end");
            }
          }}
          className="block-shadow mt-4 flex min-h-14 w-full items-center justify-center border-4 border-[var(--ink)]
            bg-[var(--paper-deep)] px-3 text-lg font-black uppercase tracking-wide disabled:opacity-35"
        >
          end round
        </button>
      )}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <Kicker>run of show</Kicker>
          <span className="mono-tag text-[var(--ink-soft)]">
            {playlist.length} queued
          </span>
        </div>
        {nextEntry ? (
          <button
            type="button"
            onClick={() => void launchNext()}
            disabled={busy}
            className="block-shadow mt-3 w-full border-4 border-[var(--ink)] bg-[var(--blue)]
              px-5 py-5 text-left text-[var(--on-blue)] disabled:opacity-40"
          >
            <span className="mono-tag">next round</span>
            <span className="mt-1 block truncate text-xl font-black">
              {nextEntry.prompt}
            </span>
            <span className="mono-tag mt-1 block opacity-80">
              tap to end current and start
            </span>
          </button>
        ) : (
          <p className="mono-tag mt-3 border-2 border-dashed border-[var(--ink)] p-4 text-[var(--ink-soft)]">
            queue is empty. Build rounds in the studio.
          </p>
        )}
        {playlist.length > 1 && (
          <ol className="mono-tag mt-4 space-y-1 text-[var(--ink-soft)]">
            {playlist.slice(1, 5).map((entry, index) => (
              <li key={entry.id}>
                {index + 2}. {entry.prompt}
              </li>
            ))}
          </ol>
        )}
      </section>

      {error && (
        <p role="alert" className="mono-tag mt-5 text-[var(--red)]">
          {error}
        </p>
      )}
    </main>
  );
}
