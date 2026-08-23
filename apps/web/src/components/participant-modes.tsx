import type {
  Activity,
  ActivityAggregate,
} from "@roomwave/shared";

import { useMemo, useRef, useState } from "react";

import { motion } from "motion/react";
import { useDrag } from "@use-gesture/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { submitResponse } from "../lib/api";
import { ErrorNote } from "./ui";
import { onSurface } from "./surface-color";
import {
  type CommonModeInputProps,
  useModeSubmit,
} from "./mode-input-shared";
import {
  CipherRoomInput,
  FutureForkInput,
  LivingConsensusInput,
  RealityBenderInput,
  ShadowCouncilInput,
} from "./signature-participant-modes";

type CommonProps = CommonModeInputProps;
const useSubmit = useModeSubmit;

// ---------------------------------------------------------------------------
// Pulse Choice: thumb lanes
// ---------------------------------------------------------------------------

export function PulseChoiceInput({
  activity,
  token,
}: CommonProps) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "pulse-choice" }
  >;

  const [selected, setSelected] = useState<string | null>(null);
  const { pending, error, run } = useSubmit(activity, token);

  return (
    <div className="space-y-4">
      {config.options.map((option, index) => {
        const active = selected === option.id;
        return (
          <motion.button
            key={option.id}
            whileTap={{ scale: 0.97 }}
            disabled={pending}
            onClick={async () => {
              // Optimistic claim; roll back to the PREVIOUS answer on failure
              // so a rejected change never loses an already-recorded vote.
              const prior = selected;
              setSelected(option.id);
              if (prior === option.id) return;
              const ok = await run({
                type: "pulse-choice",
                optionId: option.id,
              });
              if (!ok) setSelected(prior);
            }}
            className={`block-shadow-sm flex min-h-[64px] w-full items-center gap-4
              border-2 border-[var(--ink)] px-5 py-4 text-left text-xl font-bold
              transition-colors ${active ? "text-[var(--on-ink)]" : ""}`}
            style={{
              background: active ? "var(--ink)" : "var(--paper)",
            }}
          >
            <span
              aria-hidden="true"
              className="display grid h-9 w-9 shrink-0 place-items-center border-2 border-current text-base"
              style={{ background: !active ? ["var(--yellow)", "var(--red)", "var(--blue)", "var(--green)", "var(--pink)", "var(--orange)"][index % 6] : "transparent", color: active ? "var(--on-ink)" : "var(--ink)" }}
            >
              {String.fromCharCode(65 + index)}
            </span>
            {option.label}
          </motion.button>
        );
      })}

      {selected && (
        <p className="mono-tag pt-1 text-[var(--green)]">
          ✓ In the room. Tap another to change.
        </p>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spectrum: drag a marker along a rail
// ---------------------------------------------------------------------------

export function SpectrumInput({
  activity,
  token,
}: CommonProps) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "spectrum" }
  >;

  const [value, setValue] = useState(500);
  const [committed, setCommitted] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const { pending, error, run } = useSubmit(activity, token);

  async function place(next: number) {
    if (pending || next === committed) return;
    const ok = await run({ type: "spectrum", value: next });
    if (ok) setCommitted(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <span className="max-w-[40%] text-lg font-bold">{config.lowLabel}</span>
        <span
          className="display text-4xl tabular-nums transition-colors"
          style={{ color: committed !== null ? "var(--green)" : "var(--ink)" }}
        >
          {Math.round(value / 10)}
        </span>
        <span className="max-w-[40%] text-right text-lg font-bold">
          {config.highLabel}
        </span>
      </div>

      {/* Commit on release (pointer OR keyboard arrow keys); the live value
          tracks during drag so the room sees intent before it lands. */}
      <input
        type="range"
        min={0}
        max={1000}
        step={10}
        value={value}
        disabled={pending}
        aria-valuetext={`${Math.round(value / 10)} of 100`}
        onChange={(event) => setValue(Number(event.target.value))}
        onPointerDown={() => setDragging(true)}
        onPointerUp={(event) => {
          setDragging(false);
          void place(Number(event.currentTarget.value));
        }}
        onKeyUp={(event) => {
          // Arrow keys fire change without pointer events, so commit each step.
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            void place(Number(event.currentTarget.value));
          }
        }}
        onBlur={() => {
          if (!dragging) void place(value);
        }}
        aria-label="Your position on the spectrum"
        className="h-14 w-full appearance-none bg-transparent"
        style={{
          background: `linear-gradient(to right,
            var(--blue) ${value / 10}%,
            var(--paper-deep) ${value / 10}%)`,
          height: 12,
          borderRadius: 0,
          border: "2px solid var(--ink)",
        }}
      />

      {committed !== null ? (
        <p className="mono-tag text-[var(--green)]">
          ✓ Placed at {Math.round(committed / 10)}. Move to adjust.
        </p>
      ) : (
        <p className="mono-tag text-[var(--ink-soft)]">
          Slide to your spot. Release to place.
        </p>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction: numeric keypad entry
// ---------------------------------------------------------------------------

export function PredictionInput({
  activity,
  token,
}: CommonProps) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "prediction" }
  >;

  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { pending, error, run } = useSubmit(activity, token);

  const numeric = Number(text);
  const valid =
    text !== "" &&
    Number.isFinite(numeric) &&
    numeric >= config.min &&
    numeric <= config.max;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void run({ type: "prediction", value: numeric }).then((ok) => {
          if (ok) setSubmitted(true);
        });
      }}
      className="space-y-6"
    >
      <div className="flex items-end gap-3">
        <input
          inputMode="decimal"
          value={text}
          onChange={(event) => setText(event.target.value.replace(/[^0-9.-]/g, ""))}
          placeholder={`${config.min} to ${config.max}`}
          aria-label={`Your guess in ${config.unit}`}
          className="display block-shadow-sm w-full border-2 border-[var(--ink)]
            bg-white px-4 py-4 text-5xl outline-none"
        />
        <span className="display pb-4 text-3xl text-[var(--ink-soft)]">
          {config.unit}
        </span>
      </div>

      <button
        type="submit"
        disabled={!valid || pending}
        className="block-shadow-sm w-full border-2 border-[var(--ink)]
          bg-[var(--violet)] py-4 text-xl font-bold uppercase text-[var(--on-violet)]
          disabled:opacity-40"
      >
        {submitted ? "Update my guess" : "Lock my guess"}
      </button>
      {submitted && (
        <p className="mono-tag text-[var(--green)]" aria-live="polite">
          ✓ Guess in the room. You can still adjust it.
        </p>
      )}
      {error && <ErrorNote message={error} />}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Word Bloom: repeatable short phrases, one clear entry action
// ---------------------------------------------------------------------------

export function WordBloomInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "word-bloom" }
  >;
  const [text, setText] = useState("");
  const [lastTerm, setLastTerm] = useState("");
  const [sent, setSent] = useState(0);
  const { pending, error, run } = useSubmit(activity, token);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const term = text.trim();
        if (!term) return;
        void run({ type: "word-bloom", text: term }).then((ok) => {
          if (!ok) return;
          setLastTerm(term);
          setSent((value) => value + 1);
          setText("");
        });
      }}
    >
      <label className="block">
        <span className="mono-tag mb-2 block text-[var(--ink-soft)]">
          one word or short phrase
        </span>
        <input
          value={text}
          maxLength={config.maxChars}
          onChange={(event) => setText(event.target.value)}
          placeholder="What belongs in the bloom?"
          className="block-shadow-sm w-full border-2 border-[var(--ink)] bg-white px-4 py-4 text-xl outline-none"
        />
        <span className="mono-tag mt-2 block text-right text-[var(--ink-soft)]">
          {text.length}/{config.maxChars}
        </span>
      </label>
      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="block-shadow-sm w-full border-2 border-[var(--ink)] bg-[var(--orange)] py-4 text-xl font-bold uppercase text-[var(--on-orange)] disabled:opacity-40"
      >
        Add to the field
      </button>
      {sent > 0 && (
        <p className="mono-tag text-[var(--green)]" aria-live="polite">
          {config.moderationMode === "review"
            ? `✓ “${lastTerm}” sent to the host desk / ${sent} sent`
            : `✓ “${lastTerm}” landed / ${sent} sent from this phone`}
        </p>
      )}
      {error && <ErrorNote message={error} />}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Crowd Meter: bounded repeated input with tactile local acknowledgement
// ---------------------------------------------------------------------------

export function CrowdMeterInput({ activity, token }: CommonProps) {
  const [localTaps, setLocalTaps] = useState(0);
  const [error, setError] = useState("");
  const lastTap = useRef(0);

  function tap() {
    const now = Date.now();
    if (now - lastTap.current < 180) return;
    lastTap.current = now;
    setLocalTaps((value) => value + 1);
    setError("");
    navigator.vibrate?.(10);
    void submitResponse(activity.id, token, { type: "crowd-meter" }).catch(
      (caught) => {
        setError(caught instanceof Error ? caught.message : "Tap did not land.");
      },
    );
  }

  return (
    <div className="space-y-5">
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onPointerDown={tap}
        aria-label="Add energy to the room"
        className="block-shadow grid min-h-56 w-full touch-manipulation place-items-center border-4 border-[var(--ink)] bg-[var(--green)] px-8 text-center text-[var(--on-green)]"
      >
        <span>
          <span className="display block text-5xl">Tap the room</span>
          <span className="mono-tag mt-4 block opacity-85">
            each press raises the shared pressure
          </span>
        </span>
      </motion.button>
      <p className="mono-tag text-center text-[var(--ink-soft)]" aria-live="polite">
        {localTaps === 0 ? "ready for your signal" : `${localTaps} local taps landed`}
      </p>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rank Race: semantic drag/drop with keyboard and explicit move controls
// ---------------------------------------------------------------------------

function SortableRankItem({
  id,
  label,
  index,
  count,
  move,
}: {
  id: string;
  label: string;
  index: number;
  count: number;
  move: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <motion.div
      layout
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 border-2 border-[var(--ink)] bg-white p-3 ${
        isDragging ? "relative z-10 block-shadow" : "block-shadow-sm"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${label}, currently rank ${index + 1}`}
        className="display grid h-12 w-12 touch-none place-items-center border-2 border-[var(--ink)] bg-[var(--yellow)] text-2xl"
      >
        {index + 1}
      </button>
      <span className="text-lg font-black">{label}</span>
      <span className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => move(index, index - 1)}
          aria-label={`Move ${label} up`}
          className="h-10 w-10 border-2 border-[var(--ink)] bg-[var(--paper)] disabled:opacity-25"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={index === count - 1}
          onClick={() => move(index, index + 1)}
          aria-label={`Move ${label} down`}
          className="h-10 w-10 border-2 border-[var(--ink)] bg-[var(--paper)] disabled:opacity-25"
        >
          ↓
        </button>
      </span>
    </motion.div>
  );
}

export function RankRaceInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "rank-race" }>;
  const [order, setOrder] = useState(() => config.options.map((option) => option.id));
  const [submitted, setSubmitted] = useState(false);
  const { pending, error, run } = useSubmit(activity, token);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const options = useMemo(
    () => new Map(config.options.map((option) => [option.id, option.label])),
    [config.options],
  );

  function move(from: number, to: number) {
    setOrder((current) => arrayMove(current, from, to));
    navigator.vibrate?.(8);
  }

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    setOrder((current) => {
      const from = current.indexOf(String(event.active.id));
      const to = current.indexOf(String(event.over!.id));
      return arrayMove(current, from, to);
    });
  }

  return (
    <div className="space-y-5">
      <p className="mono-tag text-[var(--ink-soft)]">drag the numbered grips · or use the arrow controls</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {order.map((id, index) => (
              <SortableRankItem
                key={id}
                id={id}
                label={options.get(id) ?? "Option"}
                index={index}
                count={order.length}
                move={move}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        disabled={pending}
        onClick={() => void run({ type: "rank-race", ranks: order }).then(setSubmitted)}
        className="block-shadow-sm min-h-14 w-full border-2 border-[var(--ink)] bg-[var(--yellow)] px-5 text-lg font-black uppercase disabled:opacity-40"
      >
        {submitted ? "Update my ranking" : "Send my ranking"}
      </button>
      {submitted && <p className="mono-tag text-[var(--green)]">✓ Your order is in the race.</p>}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hot Take Duel: horizontal pull with confidence encoded as distance
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function HotTakeInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "hot-take" }>;
  const railRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(0);
  const [committed, setCommitted] = useState(false);
  const { pending, error, run } = useSubmit(activity, token);

  async function place(next: number) {
    if (pending) return;
    const safe = clamp(Math.round(next), -1000, 1000);
    setValue(safe);
    const ok = await run({ type: "hot-take", value: safe });
    if (ok) {
      setCommitted(true);
      navigator.vibrate?.(12);
    }
  }

  const bind = useDrag(
    ({ xy: [clientX], last }) => {
      const rect = railRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = clamp(((clientX - rect.left) / rect.width) * 2000 - 1000, -1000, 1000);
      setValue(Math.round(next));
      if (last) void place(next);
    },
    { axis: "x", pointer: { touch: true } },
  );

  const position = (value + 1000) / 20;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 font-black">
        <span className="max-w-[42%] text-lg">{config.leftLabel}</span>
        <span className="display text-4xl tabular-nums">{Math.round(Math.abs(value) / 10)}</span>
        <span className="max-w-[42%] text-right text-lg">{config.rightLabel}</span>
      </div>
      <div
        {...bind()}
        ref={railRef}
        role="slider"
        tabIndex={0}
        aria-label="Choose a side and confidence"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(value / 10)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const next = event.key === "Home" ? -1000 : event.key === "End" ? 1000 : value + (event.key === "ArrowLeft" ? -100 : 100);
          void place(next);
        }}
        className="relative h-24 touch-pan-y border-4 border-[var(--ink)] bg-[linear-gradient(90deg,var(--red)_0_49.5%,var(--paper)_49.5%_50.5%,var(--blue)_50.5%)]"
      >
        <motion.div
          animate={{ left: `${position}%` }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="absolute top-1/2 h-16 w-8 -translate-x-1/2 -translate-y-1/2 border-4 border-[var(--ink)] bg-[var(--yellow)] block-shadow-sm"
        />
        <span className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 bg-[var(--ink)]" />
      </div>
      <p className={`mono-tag ${committed ? "text-[var(--green)]" : "text-[var(--ink-soft)]"}`}>
        {committed ? "✓ Your pull is live. Drag again to change it." : "Pull farther from center to add confidence."}
      </p>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quadrant Drop: two-dimensional gesture with keyboard fallback
// ---------------------------------------------------------------------------

export function QuadrantDropInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "quadrant-drop" }>;
  const padRef = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState({ x: 500, y: 500 });
  const [committed, setCommitted] = useState(false);
  const { pending, error, run } = useSubmit(activity, token);

  async function place(next: { x: number; y: number }) {
    const safe = {
      x: clamp(Math.round(next.x), 0, 1000),
      y: clamp(Math.round(next.y), 0, 1000),
    };
    setPoint(safe);
    if (pending) return;
    const ok = await run({ type: "quadrant-drop", ...safe });
    if (ok) setCommitted(true);
  }

  const bind = useDrag(
    ({ xy: [clientX, clientY], last }) => {
      const rect = padRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = {
        x: clamp(((clientX - rect.left) / rect.width) * 1000, 0, 1000),
        y: clamp((1 - (clientY - rect.top) / rect.height) * 1000, 0, 1000),
      };
      setPoint({ x: Math.round(next.x), y: Math.round(next.y) });
      if (last) void place(next);
    },
    { pointer: { touch: true } },
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[auto_1fr] items-center gap-3">
        <span className="-rotate-90 whitespace-nowrap text-xs font-black uppercase">{config.yHighLabel}</span>
        <div
          {...bind()}
          ref={padRef}
          role="group"
          tabIndex={0}
          aria-label={`Place a point: horizontal ${config.xLowLabel} to ${config.xHighLabel}; vertical ${config.yLowLabel} to ${config.yHighLabel}`}
          onKeyDown={(event) => {
            const delta = event.shiftKey ? 100 : 25;
            const next = { ...point };
            if (event.key === "ArrowLeft") next.x -= delta;
            else if (event.key === "ArrowRight") next.x += delta;
            else if (event.key === "ArrowDown") next.y -= delta;
            else if (event.key === "ArrowUp") next.y += delta;
            else return;
            event.preventDefault();
            void place(next);
          }}
          className="relative aspect-square max-h-[58vh] w-full touch-none border-4 border-[var(--ink)] bg-[linear-gradient(90deg,transparent_49.5%,var(--ink)_49.5%_50.5%,transparent_50.5%),linear-gradient(0deg,transparent_49.5%,var(--ink)_49.5%_50.5%,transparent_50.5%),linear-gradient(135deg,var(--paper),white)]"
        >
          <motion.span
            animate={{ left: `${point.x / 10}%`, bottom: `${point.y / 10}%` }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="absolute h-8 w-8 -translate-x-1/2 translate-y-1/2 rounded-full border-4 border-[var(--ink)] bg-[var(--pink)] block-shadow-sm"
          />
        </div>
      </div>
      <div className="ml-8 flex justify-between text-sm font-black">
        <span>{config.xLowLabel}</span><span>{config.xHighLabel}</span>
      </div>
      <p className={`mono-tag ${committed ? "text-[var(--green)]" : "text-[var(--ink-soft)]"}`}>
        {committed ? "✓ Point placed. Drag or use arrow keys to adjust." : `bottom means ${config.yLowLabel}`}
      </p>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Board: append questions, idempotent upvotes
// ---------------------------------------------------------------------------

export function QuestionBoardInput({ activity, token, aggregate }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "question-board" }>;
  const board = aggregate?.type === "question-board" ? aggregate : null;
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [upvoted, setUpvoted] = useState<Set<string>>(() => new Set());
  const { pending, error, run } = useSubmit(activity, token);
  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const question = text.trim();
          if (!question) return;
          void run({ type: "question-board", action: "submit", question }).then((ok) => {
            if (ok) {
              setText("");
              setSubmitted(true);
            }
          });
        }}
      >
        <textarea
          value={text}
          maxLength={config.maxChars}
          rows={3}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask what the room needs to hear…"
          className="block-shadow-sm w-full resize-none border-2 border-[var(--ink)] bg-white p-4 text-lg outline-none"
        />
        <div className="flex items-center justify-between gap-4">
          <span className="mono-tag text-[var(--ink-soft)]">{text.length}/{config.maxChars}</span>
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="min-h-12 border-2 border-[var(--ink)] bg-[var(--orange)] px-5 font-black uppercase text-[var(--on-orange)] block-shadow-sm disabled:opacity-40"
          >
            send to board
          </button>
        </div>
      </form>
      {submitted && (
        <p className="mono-tag text-[var(--green)]" aria-live="polite">
          {config.moderationMode === "review"
            ? "✓ Sent to the host desk."
            : "✓ Question added to the board."}
        </p>
      )}
      {board && board.questions.length > 0 && (
        <div className="space-y-3 border-t-4 border-[var(--ink)] pt-4">
          <p className="mono-tag text-[var(--ink-soft)]">tap a ticket to raise it</p>
          {board.questions.slice(0, 12).map((question, index) => (
            <button
              type="button"
              key={question.id}
              disabled={upvoted.has(question.id) || question.answered}
              onClick={() => {
                setUpvoted((current) => new Set(current).add(question.id));
                void run({ type: "question-board", action: "upvote", questionId: question.id }).then((ok) => {
                  if (ok) return;
                  setUpvoted((current) => {
                    const next = new Set(current);
                    next.delete(question.id);
                    return next;
                  });
                });
              }}
              className="grid min-h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-2 border-[var(--ink)] bg-white p-3 text-left disabled:opacity-55"
            >
              <span className="display text-2xl">{String(index + 1).padStart(2, "0")}</span>
              <span className={question.answered ? "line-through" : "font-bold"}>{question.text}</span>
              <span className="mono-tag border-2 border-[var(--ink)] bg-[var(--yellow)] px-2 py-1">↑ {question.votes}</span>
            </button>
          ))}
        </div>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before / After: paired response for anonymous movement paths
// ---------------------------------------------------------------------------

export function BeforeAfterInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "before-after" }>;
  const [before, setBefore] = useState(500);
  const [after, setAfter] = useState(500);
  const [submitted, setSubmitted] = useState(false);
  const { pending, error, run } = useSubmit(activity, token);
  return (
    <div className="space-y-6">
      {([
        ["before", before, setBefore, "var(--ink-soft)"],
        ["after", after, setAfter, "var(--violet)"],
      ] as const).map(([label, value, setter, color]) => (
        <label key={label} className="block border-2 border-[var(--ink)] bg-white p-4 block-shadow-sm">
          <span className="mb-3 flex items-center justify-between">
            <span className="mono-tag">{label}</span>
            <span className="display text-4xl tabular-nums" style={{ color }}>{Math.round(value / 10)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            step={10}
            value={value}
            aria-label={`${label} position`}
            onChange={(event) => setter(Number(event.target.value))}
            className="h-10 w-full accent-[var(--violet)]"
          />
        </label>
      ))}
      <div className="flex justify-between text-sm font-black"><span>{config.lowLabel}</span><span>{config.highLabel}</span></div>
      <button
        type="button"
        disabled={pending}
        onClick={() => void run({ type: "before-after", before, after }).then(setSubmitted)}
        className="block-shadow-sm min-h-14 w-full border-2 border-[var(--ink)] bg-[var(--violet)] px-5 text-lg font-black uppercase text-[var(--on-violet)] disabled:opacity-40"
      >
        {submitted ? "Update my movement" : "Show my movement"}
      </button>
      {submitted && <p className="mono-tag text-[var(--green)]">✓ Your anonymous change is visible.</p>}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal / Noise - timed confidence game with a sealed server-owned answer
// ---------------------------------------------------------------------------

export function SignalNoiseInput({ activity, token }: CommonProps) {
  const [choice, setChoice] = useState<"signal" | "noise" | null>(null);
  const [confidence, setConfidence] = useState(70);
  const [submitted, setSubmitted] = useState(false);
  const { pending, error, run } = useSubmit(activity, token);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {(["signal", "noise"] as const).map((candidate) => {
          const active = choice === candidate;
          return (
            <motion.button
              key={candidate}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => setChoice(candidate)}
              className={`signal-choice min-h-32 border-3 border-[var(--ink)] p-4 text-left block-shadow-sm ${active ? "is-active" : ""}`}
              style={{
                background: active
                  ? candidate === "signal"
                    ? "var(--green)"
                    : "var(--violet)"
                  : "var(--paper)",
                color: active
                  ? onSurface(candidate === "signal" ? "var(--green)" : "var(--violet)")
                  : "var(--ink)",
              }}
            >
              <span className="display block text-3xl">{candidate}</span>
              <span className="mt-3 block text-xs font-bold uppercase tracking-widest opacity-80">
                {candidate === "signal" ? "the claim holds" : "something is off"}
              </span>
            </motion.button>
          );
        })}
      </div>

      <label className="block border-2 border-[var(--ink)] bg-[var(--paper-deep)] p-4">
        <span className="flex items-end justify-between gap-4">
          <span className="mono-tag text-[var(--ink-soft)]">how sure are you?</span>
          <span className="display text-4xl tabular-nums">{confidence}%</span>
        </span>
        <input
          type="range"
          min={50}
          max={100}
          step={1}
          value={confidence}
          onChange={(event) => setConfidence(Number(event.target.value))}
          className="mt-5 h-8 w-full accent-[var(--red)]"
          aria-label="Confidence"
        />
        <span className="mt-2 flex justify-between text-xs font-bold uppercase tracking-widest text-[var(--ink-soft)]">
          <span>leaning</span><span>certain</span>
        </span>
      </label>

      <button
        type="button"
        disabled={!choice || pending}
        onClick={() => {
          if (!choice) return;
          void run({ type: "signal-noise", choice, confidence }).then((ok) => {
            if (ok) {
              setSubmitted(true);
              navigator.vibrate?.([12, 30, 12]);
            }
          });
        }}
        className="block-shadow-sm min-h-14 w-full border-2 border-[var(--ink)] bg-[var(--red)] px-5 text-lg font-black uppercase text-[var(--on-red)] disabled:opacity-40"
      >
        {submitted ? "Update my read" : "Commit my read"}
      </button>
      {submitted && (
        <p className="mono-tag text-[var(--green)]">✓ Sealed. You can adjust before the clock runs out.</p>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

export function ModeParticipantInput(props: CommonProps) {
  switch (props.activity.type) {
    case "pulse-choice":
      return <PulseChoiceInput {...props} />;
    case "spectrum":
      return <SpectrumInput {...props} />;
    case "prediction":
      return <PredictionInput {...props} />;
    case "word-bloom":
      return <WordBloomInput {...props} />;
    case "crowd-meter":
      return <CrowdMeterInput {...props} />;
    case "rank-race":
      return <RankRaceInput {...props} />;
    case "hot-take":
      return <HotTakeInput {...props} />;
    case "quadrant-drop":
      return <QuadrantDropInput {...props} />;
    case "question-board":
      return <QuestionBoardInput {...props} />;
    case "before-after":
      return <BeforeAfterInput {...props} />;
    case "signal-noise":
      return <SignalNoiseInput {...props} />;
    case "reality-bender":
      return <RealityBenderInput {...props} />;
    case "living-consensus":
      return <LivingConsensusInput {...props} />;
    case "future-fork":
      return <FutureForkInput {...props} />;
    case "cipher-room":
      return <CipherRoomInput {...props} />;
    case "shadow-council":
      return <ShadowCouncilInput {...props} />;
    default:
      return null;
  }
}

/** Participant waiting screen after lock: show own answer vs nothing else. */
export function LockedNotice({
  aggregate,
  responseCount,
  resultVisible,
}: {
  aggregate: ActivityAggregate | null;
  responseCount: number;
  resultVisible: boolean;
}) {
  return (
    <div className="border-2 border-[var(--ink)] bg-[var(--paper-deep)] p-5 block-shadow-sm">
      <p className="display text-xl">
        {resultVisible ? "The result is live" : "Answers locked"}
      </p>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        {resultVisible
          ? "Look up. The shared result is on stage."
          : "The host is about to reveal what the room thinks."}
      </p>
      <p className="mono-tag mt-3">
        {aggregate && "total" in aggregate ? aggregate.total : responseCount} responses
      </p>
    </div>
  );
}
