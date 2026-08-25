import type { ActivityState } from "@roomwave/shared";
import { activityHasFinalResult } from "@roomwave/shared";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import NumberFlow from "@number-flow/react";

import { useRoom } from "../hooks/use-room";
import {
  Headline,
  Kicker,
} from "../components/ui";
import { ReactionLayer } from "../components/ReactionLayer";
import { ModeStagePresentation } from "../components/stage-modes";
import { PixelAvatar } from "../components/PixelAvatar";
import { RoundClock } from "../components/RoundClock";
import { SoundToggle } from "../components/SoundToggle";
import { playRoomSound } from "../lib/sound";
import { downloadReceiptCsv, receiptRows } from "../lib/receipt";
import { downloadReceiptPng } from "../lib/receipt-png";

const PHASE_COPY: Record<ActivityState, string> = {
  draft: "READY",
  live: "LIVE",
  locked: "LOCKED",
  revealed: "RESULT",
  ended: "CLOSED",
};

/** Oversized counter that kicks on every arriving response. */
function ArrivalCounter({ value }: { value: number }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.p
      key={value}
      initial={shouldReduceMotion ? false : { scale: 1.18, color: "var(--red)" }}
      animate={{ scale: 1, color: "var(--ink)" }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="stage-arrival display mt-3 text-6xl md:text-7xl"
    >
      <NumberFlow value={value} willChange />
    </motion.p>
  );
}

export function StagePage() {
  const { roomId } = useParams();
  const { state, burst, connection, error } = useRoom(roomId ?? "");
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
      <main className="grid min-h-screen place-items-center">
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
      className="safe-page relative min-h-screen overflow-hidden"
      data-room-theme={state.room.settings.theme}
    >
      <div aria-hidden="true" className="halftone absolute inset-0" />

      {/* Festival-poster ghost type: the code IS the poster. */}
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
            <>
              <motion.span
                key={activity.state}
                initial={shouldReduceMotion ? false : { scaleX: 0.4, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
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
                <ArrivalCounter value={state.responseCount} />
              )}
              <p className="stage-status-meta mono-tag mt-2 text-[var(--ink-soft)]">
                {state.onlineCount} online / {state.participantCount} joined / {state.momentum.trend}
              </p>
            </>
          )}
          {connection !== "connected" && (
            <p className="mono-tag mt-2 text-[var(--red)]">reconnecting…</p>
          )}
        </div>
      </header>

      {!activity ? (
        /* Lobby join call. */
        <section className="relative z-10 mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-4 text-center sm:px-8">
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
                  className="h-44 w-44 border-4 border-[var(--ink)] bg-[var(--paper)] p-2 block-shadow sm:h-52 sm:w-52 md:h-60 md:w-60"
                />
              )}
              <div className="min-w-0 text-center md:text-left">
                <p className="mono-tag">or enter code</p>
                <p className="mt-3 inline-block max-w-full border-4 border-[var(--ink)] bg-white px-4 py-4 display text-4xl block-shadow sm:px-8 sm:text-6xl md:text-7xl">
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
        <section className="stage-content relative z-10 mx-auto max-w-6xl px-4 pb-24 sm:px-8 md:px-12">
          <motion.h1
            key={activity.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="stage-question display max-w-5xl break-words text-4xl leading-[0.95] sm:text-5xl md:text-7xl"
          >
            {activity.prompt}
          </motion.h1>

          {activity.deadlineAt && (
            <div className="mt-7 max-w-md">
              <RoundClock
                deadlineAt={activity.deadlineAt}
                serverNow={state.serverNow}
                durationSeconds={
                  activity.config.type === "signal-noise" ||
                  activity.config.type === "cipher-room" ||
                  activity.config.type === "shadow-council"
                    ? activity.config.timeLimitSeconds
                    : undefined
                }
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

          <div className="stage-result mt-10">
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
                  <ModeStagePresentation
                    activity={activity}
                    aggregate={state.aggregate}
                  />
                  {activity.state === "revealed" &&
                    activity.config.resultsMode === "blind" && <RevealSweep />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {finalResultVisible && state.aggregate && (
            <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t-2 border-[var(--ink)] pt-4">
              <p className="mono-tag text-[var(--ink-soft)]">
                room receipt / {state.responseCount} voices / {state.room.code}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReceiptError("");
                    downloadReceiptPng({
                      roomCode: state.room.code,
                      mode: activity.type,
                      rows: [],
                      responseCount: state.responseCount,
                    }).catch((caught: unknown) =>
                      setReceiptError(
                        caught instanceof Error
                          ? caught.message
                          : "Could not render the receipt image.",
                      ),
                    );
                  }}
                  className="mono-tag block-shadow-sm border-2 border-[var(--ink)] bg-white px-3 py-2 transition-transform active:scale-95"
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
                  className="mono-tag block-shadow-sm border-2 border-[var(--ink)] bg-white px-3 py-2 transition-transform active:scale-95"
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
      <div className="h-3 overflow-hidden border-2 border-[var(--ink)] bg-white">
        <motion.div
          initial={false}
          animate={{ width: `${width}%` }}
          className="h-full bg-[var(--red)]"
        />
      </div>
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
      className="relative grid min-h-72 place-items-center overflow-hidden border-y-4 border-[var(--ink)] bg-[var(--ink)] px-8 text-center text-[var(--paper)]"
    >
      <div className="absolute inset-0 blind-stripes opacity-20" aria-hidden="true" />
      <div className="relative">
        <p className="mono-tag text-[var(--yellow)]">
          {phase === "locked" ? "the room is holding its breath" : "results sealed"}
        </p>
        <p className="display mt-5 text-6xl md:text-8xl">
          {showCount ? responseCount : "SEALED"}
          <span className="mt-2 block text-2xl md:text-3xl">answers under cover</span>
        </p>
      </div>
    </motion.div>
  );
}

function RevealSweep() {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return null;

  return (
    <motion.div
      initial={{ scaleX: 1 }}
      animate={{ scaleX: 0 }}
      transition={{ duration: 0.72, ease: [0.76, 0, 0.24, 1], delay: 0.12 }}
      style={{ transformOrigin: "right" }}
      className="pointer-events-none absolute inset-0 z-30 bg-[var(--yellow)]"
      aria-hidden="true"
    >
      <span className="display absolute left-10 top-1/2 -translate-y-1/2 text-7xl text-[var(--ink)]">
        REVEAL
      </span>
    </motion.div>
  );
}
