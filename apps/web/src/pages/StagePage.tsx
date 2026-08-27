import type { ActivityState, ActivityType, ReactionBurst } from "@roomwave/shared";
import { activityHasFinalResult, timedRoundSeconds } from "@roomwave/shared";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";

import { useRoom } from "../hooks/use-room";
import {
  Headline,
  Kicker,
} from "../components/ui";
import { ReactionLayer } from "../components/ReactionLayer";
import { ModeStagePresentation } from "../components/stage-modes";
import { PixelAvatar } from "../components/PixelAvatar";
import { ReactionStamp } from "../components/ReactionStamp";
import { RoundClock } from "../components/RoundClock";
import { SoundToggle } from "../components/SoundToggle";
import { FillBar } from "../components/FillBar";
import { playRoomSound } from "../lib/sound";
import { downloadReceiptCsv, receiptRows } from "../lib/receipt";
import { downloadReceiptPng } from "../lib/receipt-png";
import {
  emptyReactionHeat,
  REACTION_DOCK,
} from "../lib/reactions";

const PHASE_COPY: Record<ActivityState, string> = {
  draft: "READY",
  live: "LIVE",
  locked: "LOCKED",
  revealed: "RESULT",
  ended: "CLOSED",
};

/** Oversized counter that kicks on every arriving response. */
function ArrivalCounter({ value, kick }: { value: number; kick: number }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.p
      key={kick}
      initial={
        shouldReduceMotion || kick === 0
          ? false
          : { scale: 1.18, color: "var(--red)" }
      }
      animate={{ scale: 1, color: "var(--ink)" }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="stage-arrival display mt-1 text-5xl tabular-nums md:text-7xl"
    >
      {value}
    </motion.p>
  );
}

function ReactionHeat({
  burst,
  roundId,
}: {
  burst: ReactionBurst | null;
  roundId: string | null;
}) {
  const [heat, setHeat] = useState(emptyReactionHeat);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- new round clears the live tally
    setHeat(emptyReactionHeat());
  }, [roundId]);

  useEffect(() => {
    if (!burst) return;
    // oxlint-disable-next-line react/set-state-in-effect -- SSE burst is an external tally event
    setHeat((current) => ({
      ...current,
      [burst.kind]: current[burst.kind] + burst.count,
    }));
  }, [burst]);

  const total = (Object.values(heat) as number[]).reduce((sum, value) => sum + value, 0);
  if (total === 0) return null;

  return (
    <div
      className="mt-3 flex flex-wrap gap-2"
      aria-live="polite"
      aria-label="Live reactions this round"
    >
      {REACTION_DOCK.map((reaction) => {
        const count = heat[reaction.kind];
        if (count <= 0) return null;
        return (
          <span
            key={reaction.kind}
            className="inline-flex min-h-11 items-center gap-2 border-2 border-[var(--ink)] bg-white px-2 py-1"
          >
            <ReactionStamp kind={reaction.kind} size={22} />
            <span className="display text-xl tabular-nums">{count}</span>
          </span>
        );
      })}
    </div>
  );
}

const STAGE_GLYPHS: Record<ActivityType, string> = {
  "pulse-choice": "%",
  spectrum: "|",
  prediction: "^",
  "word-bloom": '"',
  "crowd-meter": "*",
  "rank-race": ">",
  "hot-take": "_",
  "quadrant-drop": "+",
  "question-board": "?",
  "before-after": "{",
  "signal-noise": "~",
  "reality-bender": "!",
  "living-consensus": "@",
  "future-fork": "Y",
  "cipher-room": "&",
  "shadow-council": "X",
  "chip-stack": "#",
  "over-under": "/",
  "fist-five": "5",
};

function StageWatermark({ glyph }: { glyph: string }) {
  return (
    <span
      aria-hidden="true"
      className="rw-watermark display pointer-events-none absolute select-none"
      style={{ right: "-0.06em", bottom: "-0.18em" }}
    >
      {glyph}
    </span>
  );
}

export function StagePage() {
  const { roomId } = useParams();
  const { state, burst, arrival, connection, error } = useRoom(roomId ?? "");
  const [qr, setQr] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const lastPhase = useRef<string | null>(null);
  const lastOnline = useRef(0);
  const roomCode = state?.room.code;
  // The blink loop is a flashing animation; suppress it for vestibular safety.
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!roomCode) return;
    const base =
      (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, "") ??
      window.location.origin;
    void QRCode.toDataURL(`${base}/join/${roomCode}`, {
      width: 320,
      margin: 1,
      color: { dark: "#17150f", light: "#f4efe3" },
    }).then(setQr).catch(() => setQr(""));
  }, [roomCode]);

  useEffect(() => {
    if (!state) return;
    const current = state.activity?.state ?? "lobby";
    if (lastPhase.current && current !== lastPhase.current) {
      playRoomSound(
        state.room.settings.soundMode,
        current === "revealed" ? "reveal" : current === "locked" ? "lock" : "ready",
      );
    }
    if (lastOnline.current > 0 && state.onlineCount > lastOnline.current) {
      playRoomSound(state.room.settings.soundMode, "join");
    }
    lastPhase.current = current;
    lastOnline.current = state.onlineCount;
  }, [state]);

  if (!state) {
    return (
      <main id="roomwave-main" className="grid min-h-dvh place-items-center">
        <p className="mono-tag text-center">{error || "connecting to room…"}</p>
      </main>
    );
  }

  const activity = state.activity;
  const finalResultVisible = activity
    ? activityHasFinalResult(activity.config, activity.state)
    : false;
  const showLiveCount =
    state.room.settings.showResponseCount || finalResultVisible;

  return (
    <main
      id="roomwave-main"
      className="stage-shell relative min-h-dvh"
      data-room-theme={state.room.settings.theme}
    >
      <div aria-hidden="true" className="halftone absolute inset-0" />
      <div aria-hidden="true" className="paper-grain" />

      {/* The room code IS the poster. */}
      <div aria-hidden="true" className="rw-ghost display">
        {state.room.code}
      </div>

      {state.room.settings.allowReactions && <ReactionLayer burst={burst} />}

      {/* Minimal room chrome in the top corners. */}
      <header className="stage-safe stage-chrome relative z-10 grid grid-cols-1 items-start gap-5 p-4 sm:flex sm:flex-wrap sm:justify-between sm:p-8 md:p-12">
        <div className="min-w-0">
          <Kicker color="var(--red)">{state.room.title}</Kicker>
          <p className="display mt-2 text-3xl tracking-[0.08em] md:text-4xl">
            {state.room.code}
          </p>
        </div>

        <div className="stage-status text-left sm:ml-auto sm:text-right">
          <div className="stage-sound mb-3 sm:flex sm:justify-end">
            <SoundToggle mode={state.room.settings.soundMode} />
          </div>
          {activity && (
            <div className="mt-2 flex flex-col items-start gap-2 sm:items-end">
              <motion.span
                key={activity.state}
                initial={shouldReduceMotion ? false : { scaleX: 0.4, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
                className="inline-block border-2 border-[var(--ink)] px-3 py-1 text-sm font-black uppercase tracking-widest"
                style={{
                  transformOrigin: "left",
                  background:
                    activity.state === "live"
                      ? "var(--green)"
                      : activity.state === "revealed"
                        ? "var(--red)"
                        : "var(--paper-deep)",
                  color:
                    activity.state === "live"
                      ? "var(--on-green)"
                      : activity.state === "revealed"
                        ? "var(--on-red)"
                        : "var(--ink)",
                }}
              >
                {finalResultVisible ? "FINAL" : PHASE_COPY[activity.state]}
              </motion.span>
              {showLiveCount && (
                <ArrivalCounter value={state.responseCount} kick={arrival} />
              )}
              <p className="stage-status-meta mono-tag text-[var(--ink-soft)]">
                {state.onlineCount} online / {state.participantCount} joined / {state.momentum.trend}
              </p>
              {state.room.settings.allowReactions && (
                <ReactionHeat burst={burst} roundId={activity.id} />
              )}
            </div>
          )}
          {connection !== "connected" && (
            <p className="mono-tag mt-2 text-[var(--red)]">reconnecting…</p>
          )}
        </div>
      </header>

      {!activity ? (
        /* Lobby join call. */
        <section className="stage-lobby relative z-10 mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-4 text-center sm:px-8">
          <div>
            <motion.p
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
              transition={{ repeat: shouldReduceMotion ? 0 : 2, duration: 1.2 }}
              className="mono-tag"
            >
              take out your phone
            </motion.p>
            <p className="mx-auto mt-4 max-w-2xl text-lg font-bold text-[var(--ink-soft)]">
              {state.room.settings.lobbyMessage}
            </p>
            <Headline size="xl">
              Join the<br />room now
            </Headline>
            <div className="mt-8 flex flex-col items-center justify-center gap-8 md:flex-row">
              {qr && (
                <img
                  src={qr}
                  alt={`QR code to join room ${state.room.code}`}
                  className="h-44 w-44 border-4 border-[var(--ink)] bg-[var(--paper)] p-2 paper-stack sm:h-52 sm:w-52 md:h-60 md:w-60"
                />
              )}
              <div className="min-w-0 text-center md:text-left">
                <p className="mono-tag">or enter code</p>
                <p className="mt-3 inline-block max-w-full border-4 border-[var(--ink)] bg-white px-4 py-4 display text-4xl paper-stack sm:px-8 sm:text-6xl md:text-7xl">
                  {state.room.code}
                </p>
                <p className="mono-tag mt-6 text-[var(--ink-soft)]">
                  {state.onlineCount} online / {state.participantCount} joined
                </p>
              </div>
            </div>
            {state.presence.length > 0 && (
              <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-4" aria-label="Players in the lobby">
                {state.presence.map((participant, index) => (
                  <motion.div
                    key={participant.id}
                    initial={{ opacity: 0, scale: 0.5, rotate: index % 2 === 0 ? -8 : 8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    layout
                    className="flex items-center gap-2 border-2 border-[var(--ink)] bg-white py-2 pl-2 pr-3 block-shadow-sm"
                  >
                    <PixelAvatar seed={participant.avatarSeed} size={34} />
                    <span className="text-sm font-black">{participant.displayName}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="stage-content relative z-10 mx-auto max-w-6xl px-4 sm:px-8 md:px-12">
          <motion.h1
            key={activity.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="stage-question poster-question max-w-5xl break-words text-4xl sm:text-5xl md:text-7xl"
          >
            {activity.prompt}
          </motion.h1>

          {activity.deadlineAt && (
            <div className="mt-7 max-w-md">
              <RoundClock
                deadlineAt={activity.deadlineAt}
                serverNow={state.serverNow}
                durationSeconds={timedRoundSeconds(activity.config)}
              />
            </div>
          )}

          <div className="stage-momentum mt-10">
            <MomentumRail
              trend={state.momentum.trend}
              rate={state.momentum.recentRate}
              responseCount={state.responseCount}
              showCount={showLiveCount}
            />
          </div>

          <div className="stage-result relative mt-10 overflow-x-clip">
            {activity && (
              <StageWatermark
                glyph={STAGE_GLYPHS[activity.config.type]}
              />
            )}
            <AnimatePresence mode="wait" initial={false}>
              {activity.config.resultsMode === "blind" &&
              activity.state !== "revealed" ? (
                <BlindResultField
                  key="sealed"
                  phase={activity.state}
                  responseCount={state.responseCount}
                  showCount={showLiveCount}
                />
              ) : (
                <motion.div
                  key="result"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.16 }}
                  id="rw-receipt-card"
                  className="rw-receipt-card rw-reveal-stamp relative"
                >
                  <p data-receipt-meta className="mono-tag mb-4 text-[var(--ink-soft)]">
                    {state.room.code} · {activity.type} · {state.responseCount === 1 ? "1 voice" : `${state.responseCount} voices`}
                  </p>
                  <ModeStagePresentation
                    activity={activity}
                    aggregate={state.aggregate}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            {activity.state === "revealed" &&
              activity.config.resultsMode === "blind" && (
                <RevealSweep key={`sweep-${activity.id}`} />
              )}
          </div>

          {finalResultVisible && state.aggregate && (
            <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t-2 border-[var(--ink)] pt-4">
              <p className="mono-tag min-w-0 text-[var(--ink-soft)]">
                room receipt / {state.responseCount === 1 ? "1 voice" : `${state.responseCount} voices`} / {state.room.code}
              </p>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setReceiptError("");
                    downloadReceiptPng({
                      roomCode: state.room.code,
                      mode: activity.type,
                      rows: receiptRows(state.aggregate!),
                      responseCount: state.responseCount,
                    }).catch((caught: unknown) =>
                      setReceiptError(
                        caught instanceof Error
                          ? caught.message
                          : "Could not render the receipt image.",
                      ),
                    );
                  }}
                  className="mono-tag block-shadow-sm min-h-11 flex-1 border-2 border-[var(--ink)] bg-white px-3 py-2 transition-transform active:scale-95 sm:flex-none"
                >
                  export png
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadReceiptCsv(receiptRows(state.aggregate!), {
                      roomTitle: state.room.title,
                      roomCode: state.room.code,
                      mode: activity.type,
                      prompt: activity.prompt,
                      responseCount: state.responseCount,
                      finishedAt: new Date().toISOString(),
                    })
                  }
                  className="mono-tag block-shadow-sm min-h-11 flex-1 border-2 border-[var(--ink)] bg-white px-3 py-2 transition-transform active:scale-95 sm:flex-none"
                >
                  export csv
                </button>
              </div>
              {receiptError && (
                <p role="alert" className="mono-tag w-full text-[var(--red)]">
                  {receiptError}
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function MomentumRail({
  trend,
  rate,
  responseCount,
  showCount,
}: {
  trend: "building" | "steady" | "cooling";
  rate: number;
  responseCount: number;
  showCount: boolean;
}) {
  const width = Math.min(100, (Math.log1p(rate) / Math.log(11)) * 100);
  return (
    <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[auto_1fr_auto] sm:gap-4">
      <span className="mono-tag text-[var(--ink-soft)]">momentum / {trend}</span>
      <FillBar share={width} color="var(--red)" className="h-3 fill-hatch" />
      <span className="mono-tag tabular-nums">
        {showCount ? `${responseCount} landed` : "count under cover"}
      </span>
    </div>
  );
}

function BlindResultField({
  phase,
  responseCount,
  showCount,
}: {
  phase: ActivityState;
  responseCount: number;
  showCount: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, clipPath: "inset(0 50% 0 50%)" }}
      animate={{ opacity: 1, clipPath: "inset(0 0% 0 0%)" }}
      exit={{ opacity: 0, clipPath: "inset(0 50% 0 50%)" }}
      transition={{ duration: 0.36, ease: [0.2, 0.9, 0.2, 1] }}
      className="relative grid min-h-56 place-items-center overflow-hidden border-y-4 border-[var(--ink)] bg-[var(--ink)] px-4 text-center text-[var(--paper)] sm:min-h-72 sm:px-8"
    >
      <div className="absolute inset-0 blind-stripes opacity-20" aria-hidden="true" />
      <div className="relative min-w-0">
        <p className="mono-tag text-[var(--yellow)]">
          {phase === "locked" ? "the room is holding its breath" : "results sealed"}
        </p>
        <p className="display mt-5 text-5xl sm:text-6xl md:text-8xl">
          {showCount ? responseCount : "SEALED"}
          <span className="mt-2 block text-xl sm:text-2xl md:text-3xl">answers under cover</span>
        </p>
      </div>
    </motion.div>
  );
}

function RevealSweep() {
  const shouldReduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);
  if (shouldReduceMotion || done) return null;

  return (
    <motion.div
      initial={{ scaleX: 1 }}
      animate={{ scaleX: 0 }}
      transition={{ duration: 0.72, ease: [0.76, 0, 0.24, 1], delay: 0.12 }}
      style={{ transformOrigin: "right" }}
      onAnimationComplete={() => setDone(true)}
      className="rw-reveal-sweep pointer-events-none absolute inset-0 z-30 overflow-hidden bg-[var(--yellow)]"
      aria-hidden="true"
    >
      <span className="display absolute bottom-5 left-4 text-5xl text-[var(--ink)] sm:bottom-8 sm:left-10 sm:text-7xl">
        REVEAL
      </span>
    </motion.div>
  );
}
