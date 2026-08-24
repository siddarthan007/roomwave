import type {
  Activity,
  ActivityAggregate,
} from "@roomwave/shared";
import { AnimatedStat } from "./AnimatedStat";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { scaleLinear } from "d3-scale";
import { curveBumpX, line } from "d3-shape";

import {
  CipherRoomStage,
  FutureForkStage,
  LivingConsensusStage,
  RealityBenderStage,
  ShadowCouncilStage,
} from "./signature-stage-modes";
import { onSurface } from "./surface-color";

const OPTION_COLORS = [
  "var(--red)",
  "var(--blue)",
  "var(--yellow)",
  "var(--green)",
  "var(--pink)",
  "var(--orange)",
];

/** Springs collapse to a near-instant tween under prefers-reduced-motion. */
function respectMotion(
  spring: { type: "spring"; stiffness: number; damping: number; delay?: number },
) {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? { duration: 0.01 }
    : spring;
}

// ---------------------------------------------------------------------------
// Pulse Choice: claiming lanes
// ---------------------------------------------------------------------------

export function PulseChoiceStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "pulse-choice" }> | null;
}) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "pulse-choice" }
  >;

  const rows = config.options.map((option, index) => ({
    ...option,
    index,
    count:
      aggregate?.options.find((candidate) => candidate.id === option.id)
        ?.count ?? 0,
    percentage:
      aggregate?.options.find((candidate) => candidate.id === option.id)
        ?.percentage ?? 0,
  }));

  const max = Math.max(1, ...rows.map((row) => row.count));
  const leader =
    aggregate && aggregate.total > 0
      ? rows.reduce((best, row) => (row.count > best.count ? row : best))
      : null;
  const winner =
    aggregate?.winnerOptionIds.length
      ? rows.find((row) => aggregate.winnerOptionIds.includes(row.id)) ?? null
      : null;
  const emphasized = winner ?? leader;

  return (
    <div className="space-y-6">
      {rows.map((row) => (
        <div key={row.id}>
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <span className="text-2xl font-bold md:text-3xl">
              {row.label}
            </span>
            <AnimatedStat
              value={Math.round(row.percentage)}
              suffix="%"
              className="display inline-flex items-baseline gap-[0.1em] text-4xl md:text-5xl"
            />
          </div>

          <div className="relative h-10 border-2 border-[var(--ink)] bg-[var(--paper-deep)] md:h-12">
            {/* Lane ticks make the rail read as a scoreboard track. */}
            <motion.div
              initial={false}
              animate={{ width: `${(row.count / max) * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
              className="absolute inset-y-0 left-0 border-r-2 border-[var(--ink)]"
              style={{
                background: OPTION_COLORS[row.index % OPTION_COLORS.length],
                opacity: emphasized && emphasized.id !== row.id ? 0.55 : 1,
              }}
            />
          </div>
        </div>
      ))}

      {leader && aggregate && aggregate.total > 0 && (
        <motion.p
          key={leader.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mono-tag text-[var(--ink-soft)]"
        >
          {winner
            ? `${config.choiceRule === "minority" ? "minority wins" : "winner"} · ${winner.label}`
            : `leading · ${leader.label}`} · {aggregate.total} responses
        </motion.p>
      )}

      {aggregate?.consensus != null && (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 pt-2">
          <span className="mono-tag text-[var(--ink-soft)]">room agreement</span>
          <div className="h-2 border border-[var(--ink)] bg-[var(--paper-deep)]">
            <motion.div
              initial={false}
              animate={{ width: `${aggregate.consensus}%` }}
              className="h-full bg-[var(--ink)]"
            />
          </div>
          <AnimatedStat
            value={aggregate.consensus}
            className="display text-3xl"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spectrum: dots landing on a rail with median marker
// ---------------------------------------------------------------------------

export function SpectrumStage({
  aggregate,
}: {
  aggregate: Extract<ActivityAggregate, { type: "spectrum" }> | null;
}) {
  const values = aggregate?.values ?? [];
  const median = aggregate?.median ?? null;
  const polarization = aggregate?.polarization ?? 0;

  // Bin values into columns of 5 so density is legible: each dot's row =
  // how many earlier dots share its bin. Deterministic across re-renders.
  const bins = new Map<number, number[]>();
  for (const value of values) {
    const bin = Math.round(value / 25); // ~2.5% wide bins
    const stack = bins.get(bin) ?? [];
    if (stack.length < 5) {
      stack.push(value);
      bins.set(bin, stack);
    }
  }
  const placed: { value: number; row: number }[] = [];
  for (const stack of bins.values()) {
    stack.forEach((value, row) => placed.push({ value, row }));
  }

  return (
    <div>
      <div className="relative h-40 border-x-2 border-b-2 border-[var(--ink)] bg-white">
        {placed.map(({ value, row }, index) => {
          const x = value / 10; // 0..100 %
          return (
            <motion.span
              key={`${index}-${value}`}
              initial={{ y: -140, opacity: 0 }}
              animate={{ y: 0, opacity: 1, top: `${82 - row * 16}%` }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 18,
                delay: Math.min(index * 0.02, 0.4),
              }}
              className="absolute h-3.5 w-3.5 rounded-full border border-[var(--ink)]"
              style={{
                left: `calc(${x}% - 7px)`,
                background: "var(--blue)",
              }}
            />
          );
        })}

        {median !== null && values.length > 0 && (
          <motion.div
            animate={{ left: `${median / 10}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 20 }}
            className="absolute bottom-[-26px] -translate-x-1/2"
          >
            <div className="h-8 w-1 bg-[var(--red)]" />
          </motion.div>
        )}
      </div>

      <div className="mt-10 flex items-end justify-between gap-6">
        <Stat label="room median">
          {values.length > 0 ? <AnimatedStat value={Math.round(median! / 10)} /> : "waiting"}
        </Stat>
        <Stat label="spread">
          {values.length < 2
            ? "WAITING"
            : polarization > 0.66
              ? "WIDE"
              : polarization > 0.33
                ? "MIXED"
                : "TIGHT"}
        </Stat>
        <Stat label="agreement">
          {aggregate?.consensus == null ? "waiting" : `${aggregate.consensus}`}
        </Stat>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word Bloom: stable keyed terms reflow as a typographic field
// ---------------------------------------------------------------------------

function wordTilt(text: string): number {
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 7) - 3) * 0.45;
}

export function WordBloomStage({
  aggregate,
}: {
  aggregate: Extract<ActivityAggregate, { type: "word-bloom" }> | null;
}) {
  const reduceMotion = useReducedMotion();
  const terms = aggregate?.terms ?? [];
  const max = Math.max(1, ...terms.map((term) => term.count));

  if (terms.length === 0) {
    return <EmptyStageCopy copy="Words will stamp into the room as they arrive." />;
  }

  return (
    <div>
      <motion.div layout className="flex min-h-72 flex-wrap content-center items-center justify-center gap-x-5 gap-y-3 border-y-4 border-[var(--ink)] bg-white px-5 py-8 md:min-h-80">
        <AnimatePresence initial={false}>
          {terms.map((term, index) => {
          const weight = term.count / max;
          const size = 24 + weight * 48;
          return (
            <motion.div
              layout
              key={term.text}
              initial={
                reduceMotion ? false : { scale: 0.92, opacity: 0, rotate: -8 }
              }
              animate={{
                scale: 1,
                opacity: 1,
                rotate: wordTilt(term.text),
              }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{
                layout: { type: "spring", stiffness: 170, damping: 24 },
                delay: Math.min(index * 0.012, 0.18),
              }}
              className="relative border-b-[5px] border-[var(--ink)] px-1 font-black leading-[0.9]"
              style={{
                fontSize: `clamp(1.4rem, ${size / 12}vw, ${size}px)`,
                color:
                  index === 0
                    ? "var(--red)"
                    : index % 4 === 1
                      ? "var(--blue)"
                      : "var(--ink)",
              }}
            >
              {term.text}
              {term.count > 1 && (
                <span className="mono-tag ml-2 align-top text-[var(--ink-soft)]">
                  ×{term.count}
                </span>
              )}
            </motion.div>
          );
          })}
        </AnimatePresence>
      </motion.div>
      <div className="grid grid-cols-2 border-b-4 border-[var(--ink)] bg-[var(--paper-deep)] sm:grid-cols-3">
        <Stat label="chorus">{aggregate?.chorusShare ?? 0}%</Stat>
        <Stat label="phrase variety">{aggregate?.phraseVariety ?? 0}%</Stat>
        <Stat label="shared theme">{aggregate?.theme?.text ?? "still forming"}</Stat>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crowd Meter: a pressure chamber, not a generic progress bar
// ---------------------------------------------------------------------------

export function CrowdMeterStage({
  aggregate,
}: {
  aggregate: Extract<ActivityAggregate, { type: "crowd-meter" }> | null;
}) {
  const shouldReduceMotion = useReducedMotion();
  const intensity = aggregate?.intensity ?? 0;
  const pressure = Math.min(
    100,
    (Math.log1p(intensity) / Math.log(21)) * 100,
  );
  const strikes = Math.min(12, aggregate?.recent ?? 0);

  return (
    <div>
      <div className="relative h-52 overflow-hidden border-4 border-[var(--ink)] bg-white md:h-64">
        <motion.div
          initial={false}
          animate={{ width: `${pressure}%` }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 110, damping: 18 }
          }
          className="absolute inset-y-0 left-0 border-r-4 border-[var(--ink)] bg-[var(--green)]"
        />
        <div className="absolute inset-0 flex items-center justify-center gap-3 overflow-hidden px-6">
          {Array.from({ length: strikes }, (_, index) => (
            <motion.span
              key={`${aggregate?.total ?? 0}-${index}`}
              initial={shouldReduceMotion ? false : { scaleY: 0.1, opacity: 0 }}
              animate={{
                scaleY: 1,
                opacity: 0.75,
                rotate: (index - strikes / 2) * 4,
              }}
              className="h-24 w-2 origin-bottom border border-[var(--ink)] bg-[var(--yellow)] md:h-32"
            />
          ))}
        </div>
        <div className="absolute inset-0 grid place-items-center text-center mix-blend-multiply">
          <div>
            <p className="display text-7xl tabular-nums md:text-9xl">
              {intensity.toFixed(1)}
            </p>
            <p className="mono-tag mt-2">taps / second</p>
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between gap-4">
        <Stat label="rolling taps">{aggregate?.recent ?? 0}</Stat>
        <Stat label="all-time signal">{aggregate?.total ?? 0}</Stat>
        <Stat label="room state">
          {pressure > 76 ? "ROARING" : pressure > 42 ? "RISING" : pressure > 0 ? "WARM" : "READY"}
        </Stat>
      </div>
    </div>
  );
}

function EmptyStageCopy({ copy }: { copy: string }) {
  return (
    <div className="grid min-h-60 place-items-center border-y-4 border-[var(--ink)] bg-white px-8 text-center">
      <p className="display max-w-2xl text-3xl text-[var(--ink-soft)] md:text-5xl">
        {copy}
      </p>
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="mono-tag mb-1 text-[var(--ink-soft)]">{label}</p>
      <p className="display break-words text-3xl sm:text-4xl md:text-5xl">
        {children}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prediction: guess cloud plus truth drop on reveal
// ---------------------------------------------------------------------------

export function PredictionStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "prediction" }> | null;
}) {
  const reduceMotion = useReducedMotion();
  const config = activity.config as Extract<
    Activity["config"],
    { type: "prediction" }
  >;

  const revealed = activity.state === "revealed";
  const values = aggregate?.values ?? [];
  const answer = aggregate?.answer ?? null;

  // Map a value to rail percentage; guard against a degenerate min===max.
  const span = config.max - config.min;
  const pos = (value: number) =>
    span <= 0 ? 50 : ((value - config.min) / span) * 100;

  return (
    <div>
      {/* Guess rail */}
      <div className="relative mt-6 h-28 border-x-2 border-b-2 border-[var(--ink)] bg-white">
        {values.map((value, index) => (
          <motion.span
            key={`${index}-${value}`}
            initial={
              reduceMotion ? false : { scale: 0.94, y: -24, opacity: 0 }
            }
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ delay: Math.min(index * 0.03, 0.5), type: "spring", stiffness: 260, damping: 16 }}
            className="absolute top-4 h-4 w-4 border-2 border-[var(--ink)]"
            style={{
              left: `calc(${pos(value)}% - 8px)`,
              background: "var(--yellow)",
              transform: `rotate(${index * 13}deg)`,
            }}
          />
        ))}

        {/* The truth marker drops in only on reveal. */}
        {revealed && answer !== null && (
          <motion.div
            initial={{ y: -300, rotate: -30, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            transition={respectMotion({
              type: "spring",
              stiffness: 160,
              damping: 14,
              delay: 0.15,
            })}
            className="absolute inset-y-0 z-10 w-[6px] -translate-x-1/2 bg-[var(--red)]"
            style={{ left: `${pos(answer)}%` }}
          >
            <div
              className="display absolute top-[-52px] left-1/2 -translate-x-1/2 whitespace-nowrap
                border-2 border-[var(--ink)] bg-[var(--red)] px-3 py-1 text-2xl text-[var(--on-red)] block-shadow-sm"
            >
              {answer}
              {config.unit}
            </div>
          </motion.div>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <span className="mono-tag">{config.min}</span>
        <span className="mono-tag">{config.max}</span>
      </div>

      <div className="mt-8 grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
        <Stat label="guesses">{aggregate?.total ?? 0}</Stat>
        <Stat label="room median">
          {values.length > 0 && aggregate
            ? `${Math.round(aggregate.median)}${config.unit}`
            : "waiting"}
        </Stat>
        <Stat label="avg miss">
          {aggregate?.meanAbsoluteError != null
            ? `±${Math.round(aggregate.meanAbsoluteError * 10) / 10}${config.unit}`
            : revealed
              ? "waiting"
              : "hidden"}
        </Stat>
      </div>

      {revealed && aggregate && aggregate.winners.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mt-8 inline-block border-2 border-[var(--ink)] bg-[var(--green)] px-5 py-3 text-[var(--on-green)] block-shadow-sm"
        >
          <p className="mono-tag">closest in the room</p>
          <p className="display mt-1 text-3xl">
            {aggregate.winners.map((winner) => `${winner.value}${config.unit}`).join("  ·  ")}
          </p>
        </motion.div>
      )}

      {!revealed && (
        <p className="mono-tag mt-8 text-[var(--ink-soft)]">
          truth withheld until host reveals
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rank Race: Borda position as a live track, not a ranking table
// ---------------------------------------------------------------------------

export function RankRaceStage({
  aggregate,
}: {
  aggregate: Extract<ActivityAggregate, { type: "rank-race" }> | null;
}) {
  const options = aggregate?.options ?? [];
  return (
    <div className="space-y-4">
      {options.length === 0 ? (
        <EmptyStageCopy copy="The starting grid is waiting for its first ranking." />
      ) : (
        options.map((option, index) => (
          <motion.div layout key={option.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
            <motion.span
              layout
              className="display grid h-12 w-12 place-items-center border-2 border-[var(--ink)] bg-[var(--yellow)] text-2xl"
            >
              {index + 1}
            </motion.span>
            <div>
              <div className="mb-1 flex items-end justify-between gap-4">
                <span className="text-xl font-black md:text-3xl">{option.label}</span>
                <span className="mono-tag">{option.firstPlaceShare}% first-place</span>
              </div>
              <div className="relative h-10 overflow-hidden border-2 border-[var(--ink)] bg-[var(--paper-deep)]">
                <motion.div
                  layout
                  initial={false}
                  animate={{ width: `${option.score}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                  className="absolute inset-y-0 left-0 border-r-2 border-[var(--ink)]"
                  style={{ background: OPTION_COLORS[index % OPTION_COLORS.length] }}
                />
                <motion.span
                  animate={{ left: `clamp(18px, ${option.score}%, calc(100% - 18px))` }}
                  transition={{ type: "spring", stiffness: 150, damping: 20 }}
                  className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[var(--ink)] bg-white"
                />
              </div>
            </div>
            <div className="text-right">
              <p className="display text-4xl tabular-nums">{option.score}</p>
              <p className="mono-tag text-[var(--ink-soft)]">race score</p>
            </div>
          </motion.div>
        ))
      )}
      {aggregate && <p className="mono-tag pt-2 text-[var(--ink-soft)]">{aggregate.total} complete rankings · updates use every position</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hot Take Duel: weighted tension beam with sampled room positions
// ---------------------------------------------------------------------------

export function HotTakeStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "hot-take" }> | null;
}) {
  const config = activity.config as Extract<Activity["config"], { type: "hot-take" }>;
  const values = aggregate?.values ?? [];
  const sampled = values.filter((_, index) => values.length <= 120 || index % Math.ceil(values.length / 120) === 0);
  const x = scaleLinear().domain([-1000, 1000]).range([0, 100]);
  const marker = x(aggregate?.average ?? 0);
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-6">
        <span className="max-w-[38%] text-2xl font-black text-[var(--red)] md:text-4xl">{config.leftLabel}</span>
        <span className="mono-tag text-[var(--ink-soft)]">weighted room pull</span>
        <span className="max-w-[38%] text-right text-2xl font-black text-[var(--blue)] md:text-4xl">{config.rightLabel}</span>
      </div>
      <div className="relative h-48 overflow-hidden border-4 border-[var(--ink)] bg-[linear-gradient(90deg,var(--red)_0_49.5%,var(--paper)_49.5%_50.5%,var(--blue)_50.5%)] md:h-56">
        {sampled.map((value, index) => (
          <motion.span
            key={`${index}-${value}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 0.65, scale: 1, left: `${x(value)}%` }}
            className="absolute h-3 w-3 -translate-x-1/2 rounded-full border border-[var(--ink)] bg-[var(--yellow)]"
            style={{ top: `${18 + (index % 6) * 12}%` }}
          />
        ))}
        <span className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 bg-[var(--ink)]" />
        <motion.div
          initial={false}
          animate={{ left: `${marker}%` }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
          className="absolute bottom-4 h-20 w-5 -translate-x-1/2 border-2 border-[var(--ink)] bg-[var(--yellow)] block-shadow-sm"
        />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="left force">{aggregate?.leftWeight ?? 0}%</Stat>
        <Stat label="room center">{Math.round((aggregate?.average ?? 0) / 10)}</Stat>
        <Stat label="right force">{aggregate?.rightWeight ?? 0}%</Stat>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quadrant Drop: React-owned SVG geometry with a semantic summary
// ---------------------------------------------------------------------------

export function QuadrantDropStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "quadrant-drop" }> | null;
}) {
  const config = activity.config as Extract<Activity["config"], { type: "quadrant-drop" }>;
  const points = aggregate?.points ?? [];
  const sampled = points.filter((_, index) => points.length <= 180 || index % Math.ceil(points.length / 180) === 0);
  const x = scaleLinear().domain([0, 1000]).range([55, 945]);
  const y = scaleLinear().domain([0, 1000]).range([595, 55]);
  return (
    <div>
      <div className="relative border-4 border-[var(--ink)] bg-white">
        <svg viewBox="0 0 1000 650" role="img" aria-label={`${aggregate?.total ?? 0} responses placed on ${config.xLowLabel} to ${config.xHighLabel} and ${config.yLowLabel} to ${config.yHighLabel}`} className="block w-full">
          <line x1="500" x2="500" y1="30" y2="620" stroke="var(--ink)" strokeWidth="4" />
          <line x1="30" x2="970" y1="325" y2="325" stroke="var(--ink)" strokeWidth="4" />
          {sampled.map((point, index) => (
            <motion.circle
              key={point.id}
              initial={{ r: 0, opacity: 0 }}
              animate={{ cx: x(point.x), cy: y(point.y), r: 10, opacity: 0.72 }}
              transition={{ delay: Math.min(index * 0.006, 0.25), type: "spring", stiffness: 220, damping: 19 }}
              fill={OPTION_COLORS[index % OPTION_COLORS.length]}
              stroke="var(--ink)"
              strokeWidth="3"
            />
          ))}
          {aggregate?.centroid && (
            <motion.g animate={{ x: x(aggregate.centroid.x), y: y(aggregate.centroid.y) }}>
              <circle r="24" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="5" />
              <path d="M-10 0H10M0-10V10" stroke="var(--ink)" strokeWidth="4" />
            </motion.g>
          )}
        </svg>
        <span className="absolute left-2 top-2 mono-tag">{config.yHighLabel}</span>
        <span className="absolute bottom-2 left-2 mono-tag">{config.xLowLabel}</span>
        <span className="absolute bottom-2 right-2 mono-tag">{config.xHighLabel}</span>
        <span className="absolute bottom-8 left-2 mono-tag">{config.yLowLabel}</span>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="placed">{aggregate?.total ?? 0}</Stat>
        <Stat label="largest quadrant">
          {aggregate ? `${Math.max(...aggregate.quadrantShares)}%` : "waiting"}
        </Stat>
        <Stat label="far outliers">{aggregate?.outlierCount ?? 0}</Stat>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Board: a projected queue of stage tickets
// ---------------------------------------------------------------------------

export function QuestionBoardStage({
  aggregate,
}: {
  aggregate: Extract<ActivityAggregate, { type: "question-board" }> | null;
}) {
  const questions = aggregate?.questions ?? [];
  if (questions.length === 0) return <EmptyStageCopy copy="The question queue is open." />;
  return (
    <div className="space-y-3">
      <AnimatePresence initial={false} mode="popLayout">
        {questions.slice(0, 7).map((question, index) => (
          <motion.div
            layout
            key={question.id}
            initial={{ x: 70, opacity: 0, rotate: 1.5 }}
            animate={{ x: 0, opacity: question.answered ? 0.45 : 1, rotate: 0 }}
            exit={{ x: -70, opacity: 0 }}
            className={`grid grid-cols-[auto_1fr_auto] items-center gap-5 border-2 border-[var(--ink)] p-4 md:p-5 ${
              index === 0 && !question.answered ? "bg-[var(--yellow)] block-shadow" : "bg-white block-shadow-sm"
            }`}
          >
            <span className="display text-4xl tabular-nums">{String(index + 1).padStart(2, "0")}</span>
            <p className={`text-xl font-black md:text-3xl ${question.answered ? "line-through" : ""}`}>{question.text}</p>
            <div className="text-right"><p className="display text-4xl">{question.votes}</p><p className="mono-tag">room votes</p></div>
          </motion.div>
        ))}
      </AnimatePresence>
      <p className="mono-tag pt-2 text-[var(--ink-soft)]">{aggregate?.total ?? 0} submitted · raised questions move toward the stage</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before / After: anonymous migration paths and convergence
// ---------------------------------------------------------------------------

export function BeforeAfterStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "before-after" }> | null;
}) {
  const config = activity.config as Extract<Activity["config"], { type: "before-after" }>;
  const shouldReduceMotion = useReducedMotion();
  const movements = (aggregate?.movements ?? []).filter((_, index, all) => all.length <= 90 || index % Math.ceil(all.length / 90) === 0);
  const x = scaleLinear().domain([0, 1000]).range([90, 910]);
  const path = line<[number, number]>().x((point) => point[0]).y((point) => point[1]).curve(curveBumpX);
  return (
    <div>
      <div className="border-4 border-[var(--ink)] bg-white p-3">
        <svg viewBox="0 0 1000 520" role="img" aria-label={`${aggregate?.total ?? 0} anonymous before and after movements`} className="block w-full">
          <text x="24" y="115" className="mono-tag" fill="var(--ink)">BEFORE</text>
          <text x="24" y="425" className="mono-tag" fill="var(--ink)">AFTER</text>
          <line x1="90" x2="910" y1="100" y2="100" stroke="var(--ink)" strokeWidth="5" />
          <line x1="90" x2="910" y1="410" y2="410" stroke="var(--ink)" strokeWidth="5" />
          {movements.map((movement, index) => {
            const d = path([[x(movement.before), 105], [x(movement.after), 405]]) ?? undefined;
            return (
              <g key={movement.id}>
                <motion.path
                  d={d}
                  fill="none"
                  stroke={OPTION_COLORS[index % OPTION_COLORS.length]}
                  strokeWidth="4"
                  strokeOpacity="0.42"
                  initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: Math.min(index * 0.008, 0.35), duration: 0.7 }}
                />
                <circle cx={x(movement.before)} cy="100" r="8" fill="var(--ink)" />
                <circle cx={x(movement.after)} cy="410" r="10" fill={OPTION_COLORS[index % OPTION_COLORS.length]} stroke="var(--ink)" strokeWidth="3" />
              </g>
            );
          })}
          <text x="90" y="490" fill="var(--ink)" fontWeight="800">{config.lowLabel}</text>
          <text x="910" y="490" textAnchor="end" fill="var(--ink)" fontWeight="800">{config.highLabel}</text>
        </svg>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="median shift">{aggregate ? `${Math.round(aggregate.beforeMedian / 10)} → ${Math.round(aggregate.afterMedian / 10)}` : "waiting"}</Stat>
        <Stat label="changed minds">{aggregate?.changedShare ?? 0}%</Stat>
        <Stat label="convergence">{aggregate ? `${aggregate.convergence > 0 ? "+" : ""}${aggregate.convergence}` : "waiting"}</Stat>
      </div>
    </div>
  );
}

export function SignalNoiseStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "signal-noise" }> | null;
}) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "signal-noise" }
  >;
  if (!aggregate || aggregate.correctAnswer === null) {
    return <EmptyStageCopy copy="Reads are sealed until the reveal." />;
  }

  const signalShare =
    aggregate.total === 0 ? 0 : (aggregate.signalCount / aggregate.total) * 100;
  const correct = aggregate.correctAnswer;

  return (
    <div className="overflow-hidden border-4 border-[var(--ink)] bg-white block-shadow">
      <div className="grid md:grid-cols-[0.9fr_1.1fr]">
        <motion.div
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: 0.58, ease: [0.2, 0.9, 0.2, 1] }}
          className="grid min-h-64 place-items-center border-b-4 border-[var(--ink)] p-7 md:border-b-0 md:border-r-4"
          style={{
            background: correct === "signal" ? "var(--green)" : "var(--violet)",
            color: onSurface(correct === "signal" ? "var(--green)" : "var(--violet)"),
          }}
        >
          <div className="text-center">
            <p className="mono-tag opacity-75">the room was reading</p>
            <p className="display mt-5 text-6xl sm:text-7xl">{correct}</p>
            {config.explanation && (
              <p className="mx-auto mt-5 max-w-sm text-base font-bold leading-snug opacity-90">
                {config.explanation}
              </p>
            )}
          </div>
        </motion.div>

        <div className="p-6 sm:p-8">
          <div className="flex h-28 overflow-hidden border-3 border-[var(--ink)] bg-[var(--violet)] text-[var(--on-violet)]">
            <motion.div
              initial={{ width: "50%" }}
              animate={{ width: `${signalShare}%` }}
              transition={respectMotion({ type: "spring", stiffness: 120, damping: 18 })}
              className="grid min-w-0 place-items-center bg-[var(--green)] text-[var(--on-green)]"
            >
              {aggregate.signalCount > 0 && (
                <span className="display text-2xl">{aggregate.signalCount}</span>
              )}
            </motion.div>
            <div className="grid min-w-0 flex-1 place-items-center">
              {aggregate.noiseCount > 0 && (
                <span className="display text-2xl">{aggregate.noiseCount}</span>
              )}
            </div>
          </div>
          <div className="mt-2 flex justify-between text-xs font-black uppercase tracking-widest">
            <span>signal</span><span>noise</span>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4">
            <Stat label="room accuracy">{aggregate.accuracy}%</Stat>
            <Stat label="average nerve">{aggregate.averageConfidence}%</Stat>
            <Stat label="confidence gap">{aggregate.calibrationGap}</Stat>
            <Stat label="bold misses">{aggregate.highConfidenceWrongShare}%</Stat>
          </div>
          <p className="mono-tag mt-7 border-t-2 border-[var(--ink)] pt-3 text-[var(--ink-soft)]">
            lower is better / forecast error {aggregate.brierScore} of 100
          </p>
        </div>
      </div>
    </div>
  );
}

export function ModeStagePresentation({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: ActivityAggregate | null;
}) {
  switch (activity.type) {
    case "pulse-choice":
      return (
        <PulseChoiceStage
          activity={activity}
          aggregate={
            aggregate && aggregate.type === "pulse-choice" ? aggregate : null
          }
        />
      );
    case "spectrum":
      return (
        <SpectrumStage
          aggregate={aggregate && aggregate.type === "spectrum" ? aggregate : null}
        />
      );
    case "prediction":
      return (
        <PredictionStage
          activity={activity}
          aggregate={
            aggregate && aggregate.type === "prediction" ? aggregate : null
          }
        />
      );
    case "word-bloom":
      return (
        <WordBloomStage
          aggregate={
            aggregate && aggregate.type === "word-bloom" ? aggregate : null
          }
        />
      );
    case "crowd-meter":
      return (
        <CrowdMeterStage
          aggregate={
            aggregate && aggregate.type === "crowd-meter" ? aggregate : null
          }
        />
      );
    case "rank-race":
      return <RankRaceStage aggregate={aggregate?.type === "rank-race" ? aggregate : null} />;
    case "hot-take":
      return <HotTakeStage activity={activity} aggregate={aggregate?.type === "hot-take" ? aggregate : null} />;
    case "quadrant-drop":
      return <QuadrantDropStage activity={activity} aggregate={aggregate?.type === "quadrant-drop" ? aggregate : null} />;
    case "question-board":
      return <QuestionBoardStage aggregate={aggregate?.type === "question-board" ? aggregate : null} />;
    case "before-after":
      return <BeforeAfterStage activity={activity} aggregate={aggregate?.type === "before-after" ? aggregate : null} />;
    case "signal-noise":
      return <SignalNoiseStage activity={activity} aggregate={aggregate?.type === "signal-noise" ? aggregate : null} />;
    case "reality-bender":
      return <RealityBenderStage activity={activity} aggregate={aggregate?.type === "reality-bender" ? aggregate : null} />;
    case "living-consensus":
      return <LivingConsensusStage activity={activity} aggregate={aggregate?.type === "living-consensus" ? aggregate : null} />;
    case "future-fork":
      return <FutureForkStage activity={activity} aggregate={aggregate?.type === "future-fork" ? aggregate : null} />;
    case "cipher-room":
      return <CipherRoomStage activity={activity} aggregate={aggregate?.type === "cipher-room" ? aggregate : null} />;
    case "shadow-council":
      return <ShadowCouncilStage activity={activity} aggregate={aggregate?.type === "shadow-council" ? aggregate : null} />;
    default:
      return null;
  }
}
