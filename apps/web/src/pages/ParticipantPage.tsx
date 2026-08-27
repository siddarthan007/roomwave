import type { ReactionBurst, ReactionKind } from "@roomwave/shared";
import { activityHasFinalResult, timedRoundSeconds } from "@roomwave/shared";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";

import { useRoom } from "../hooks/use-room";
import { sendReaction, touchPresence } from "../lib/api";
import { getParticipantSession } from "../lib/storage";
import { copyText } from "../lib/clipboard";
import { REACTION_DOCK } from "../lib/reactions";
import { ReactionLayer } from "../components/ReactionLayer";
import { ReactionStamp } from "../components/ReactionStamp";
import { PixelAvatar } from "../components/PixelAvatar";
import { RoundClock } from "../components/RoundClock";
import { SoundToggle } from "../components/SoundToggle";
import { playBoundSound, playRoomSound } from "../lib/sound";
import {
  BlockButton,
  Headline,
  Kicker,
} from "../components/ui";
import {
  LockedNotice,
  ModeParticipantInput,
} from "../components/participant-modes";

export function ParticipantPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { state, burst, connection, error: roomError } = useRoom(roomId ?? "");
  const lastSent = useRef(0);
  const sharedTimer = useRef<number | null>(null);
  const lastPhase = useRef<string | null>(null);
  const [shared, setShared] = useState(false);
  const [localBurst, setLocalBurst] = useState<ReactionBurst | null>(null);
  const [pressedKind, setPressedKind] = useState<ReactionKind | null>(null);
  const session = useMemo(
    () => (roomId ? getParticipantSession(roomId) : null),
    [roomId],
  );
  const phase = state?.activity?.state ?? null;
  const soundMode = state?.room.settings.soundMode ?? "off";

  useEffect(() => {
    if (!roomId || !session) return;
    const touch = () => {
      if (document.visibilityState === "visible") {
        void touchPresence(roomId, session.token).catch(() => null);
      }
    };
    touch();
    const timer = window.setInterval(touch, 20_000);
    window.addEventListener("focus", touch);
    document.addEventListener("visibilitychange", touch);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", touch);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [roomId, session]);

  useEffect(() => {
    if (phase && lastPhase.current && phase !== lastPhase.current) {
      playRoomSound(
        soundMode,
        phase === "revealed" ? "reveal" : phase === "locked" ? "lock" : "ready",
      );
    }
    lastPhase.current = phase;
  }, [phase, soundMode]);

  useEffect(
    () => () => {
      // Unmount mid-timeout: drop the pending "shared ✓" reset.
      if (sharedTimer.current !== null) window.clearTimeout(sharedTimer.current);
    },
    [],
  );

  if (!roomId) throw new Error("Room ID missing");

  if (!state) {
    return (
      <main id="roomwave-main" className="grid min-h-dvh place-items-center">
        <p className="mono-tag text-center">
          {roomError || "joining…"}
        </p>
      </main>
    );
  }

  const activity = state.activity;
  const finalResultVisible = activity
    ? activityHasFinalResult(activity.config, activity.state)
    : false;
  function react(kind: ReactionKind) {
    // Client-side throttle: max one reaction per second per participant.
    // The server buckets further; this keeps the dock honest under mashing.
    // oxlint-disable-next-line react/purity -- read only inside a user event
    const now = Date.now();
    if (now - lastSent.current < 1000) return;
    lastSent.current = now;
    navigator.vibrate?.(15);
    playBoundSound("react");
    setLocalBurst({ kind, count: 1, bucket: -now });
    setPressedKind(kind);
    window.setTimeout(() => {
      setPressedKind((current) => (current === kind ? null : current));
    }, 280);
    if (!session) return;
    void sendReaction(roomId!, session.token, kind);
  }

  async function shareRoom() {
    if (!state) return;
    const url = `${window.location.origin}/join/${state.room.code}`;
    const text = `${state.room.title} is live on Roomwave. Join the next round.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: state.room.title, text, url });
      } else {
        await copyText(`${text} ${url}`);
      }
      setShared(true);
      if (sharedTimer.current !== null) window.clearTimeout(sharedTimer.current);
      sharedTimer.current = window.setTimeout(() => {
        sharedTimer.current = null;
        setShared(false);
      }, 1600);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
    }
  }

  return (
    <main
      id="roomwave-main"
      className={`safe-page safe-gutters safe-top relative min-h-dvh overflow-x-clip pt-6 ${state.room.settings.allowReactions ? "has-reaction-dock" : "pb-8"}`}
      data-room-theme={state.room.settings.theme}
    >
      <ReactionLayer burst={burst} localBurst={localBurst} />

      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {session && (
            <PixelAvatar seed={session.avatarSeed} />
          )}
          <div className="min-w-0">
            <Kicker color="var(--red)">{state.room.title}</Kicker>
            {session && (
              <p className="mt-1 truncate text-sm font-black">{session.displayName}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="mono-tag text-[var(--ink-soft)]">
            {connection === "connected" ? state.room.code : "reconnecting"}
          </span>
          <SoundToggle mode={state.room.settings.soundMode} />
        </div>
      </header>

      {!activity || activity.state === "draft" ? (
        <section className="mt-12 text-center sm:mt-20">
          <Headline size="lg">
            Waiting for<br />the host
          </Headline>
          <p className="mt-6 text-lg text-[var(--ink-soft)]">
            The next activity appears here automatically.
          </p>
        </section>
      ) : activity.state === "live" ? (
        <section className="mt-10">
          <Headline size="md">{activity.prompt}</Headline>
          {connection !== "connected" && (
            <p
              role="status"
              className="mono-tag mb-4 border-2 border-[var(--ink)] bg-[var(--paper-deep)] px-4 py-2"
            >
              reconnecting: your recorded answer is safe
            </p>
          )}
          {activity.deadlineAt && (
            <div className="mt-5">
              <RoundClock
                deadlineAt={activity.deadlineAt}
                serverNow={state.serverNow}
                durationSeconds={timedRoundSeconds(activity.config)}
              />
            </div>
          )}
          <div className="mx-auto mt-10 w-full max-w-md">
            {session ? (
              <ModeParticipantInput
                key={activity.id}
                activity={activity}
                token={session.token}
                aggregate={state.aggregate}
              />
            ) : (
              <div className="mt-6 border-2 border-[var(--ink)] bg-[var(--paper-deep)] p-5 block-shadow-sm">
                <p className="text-lg font-bold">Session lost.</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Your answer slot expired. Rejoin to keep playing.
                </p>
                <div className="mt-4">
                  <BlockButton
                    onClick={() => navigate(`/join/${state.room.code}`)}
                    wide
                    color="var(--yellow)"
                  >
                    rejoin room
                  </BlockButton>
                </div>
              </div>
            )}
          </div>
          {state.room.settings.allowReactions && (
            <div className="h-24" aria-hidden="true" />
          )}
        </section>
      ) : (
        <section className="mt-12">
          <LockedNotice
            aggregate={state.aggregate}
            responseCount={state.responseCount}
            resultVisible={finalResultVisible}
          />
          {finalResultVisible && (
            <button
              type="button"
              onClick={() => void shareRoom()}
              className="block-shadow-sm mt-5 w-full border-2 border-[var(--ink)] bg-[var(--yellow)] px-5 py-4 text-lg font-black uppercase"
            >
              {shared ? "invite ready" : "bring someone into the next round"}
            </button>
          )}
        </section>
      )}

      {/* Reactions dock stays in one-thumb reach at the bottom. */}
      {state.room.settings.allowReactions && (
      <nav
        aria-label="Reactions"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md
          items-center justify-around gap-2 border-t-2 border-[var(--ink)]
          bg-[var(--paper)] px-3 pt-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {REACTION_DOCK.map((reaction) => (
          <motion.button
            key={reaction.kind}
            type="button"
            whileTap={{ scale: 0.86 }}
            onClick={() => react(reaction.kind)}
            disabled={!session}
            aria-label={`Send ${reaction.kind}`}
            aria-pressed={pressedKind === reaction.kind}
            className="grid h-14 w-14 place-items-center border-2 border-[var(--ink)]
              disabled:opacity-35"
            style={{
              background: pressedKind === reaction.kind ? reaction.color : "white",
            }}
          >
            <ReactionStamp kind={reaction.kind} size={28} />
          </motion.button>
        ))}
      </nav>
      )}
    </main>
  );
}
