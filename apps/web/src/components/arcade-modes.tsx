import type { Activity, ActivityAggregate } from "@roomwave/shared";
import { motion } from "motion/react";
import { useState } from "react";

import { AnimatedStat } from "./AnimatedStat";
import { FillBar, FillColumn } from "./FillBar";
import { ErrorNote } from "./ui";
import { onSurface } from "./surface-color";
import {
  type CommonModeInputProps,
  useModeSubmit,
} from "./mode-input-shared";

const CHIP_COLORS = [
  "var(--red)",
  "var(--blue)",
  "var(--yellow)",
  "var(--green)",
  "var(--pink)",
  "var(--orange)",
];

type CommonProps = CommonModeInputProps;

export function ChipStackInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "chip-stack" }>;
  const { pending, error, run, restore } = useModeSubmit(activity, token);
  const restored = restore<{ allocations: Array<{ optionId: string; chips: number }> }>();
  const [chips, setChips] = useState<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    for (const option of config.options) next[option.id] = 0;
    if (restored?.allocations) {
      for (const allocation of restored.allocations) {
        if (allocation.optionId in next) next[allocation.optionId] = allocation.chips;
      }
    }
    return next;
  });
  const [sealed, setSealed] = useState(Boolean(restored));

  const spent = Object.values(chips).reduce((sum, value) => sum + value, 0);
  const remaining = config.chipsPerPerson - spent;

  async function commit(next = chips) {
    const allocations = config.options.map((option) => ({
      optionId: option.id,
      chips: next[option.id] ?? 0,
    }));
    const ok = await run({ type: "chip-stack", allocations });
    if (ok) setSealed(true);
  }

  function assign(optionId: string, wanted: number) {
    if (!Number.isFinite(wanted)) return;
    setChips((current) => {
      const others = Object.entries(current).reduce(
        (sum, [id, count]) => sum + (id === optionId ? 0 : count),
        0,
      );
      const nextValue = Math.max(
        0,
        Math.min(Math.trunc(wanted), config.chipsPerPerson - others),
      );
      if (nextValue === (current[optionId] ?? 0)) return current;
      return { ...current, [optionId]: nextValue };
    });
    setSealed(false);
  }

  return (
    <div className="space-y-4">
      <div
        className="flex items-end justify-between gap-3 border-2 border-[var(--ink)] bg-[var(--yellow)] px-4 py-3"
        aria-live="polite"
        aria-label={`${remaining} of ${config.chipsPerPerson} chips left`}
      >
        <span className="mono-tag">chips left</span>
        <span className="text-right">
          <span className="display text-5xl tabular-nums">{remaining}</span>
          <span className="mono-tag ml-2">of {config.chipsPerPerson}</span>
        </span>
      </div>

      {config.options.map((option, index) => {
        const count = chips[option.id] ?? 0;
        return (
          <div
            key={option.id}
            className="border-2 border-[var(--ink)] bg-[var(--paper)] p-3"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center border-2 border-[var(--ink)] font-black"
                style={{ background: CHIP_COLORS[index % CHIP_COLORS.length] }}
              >
                {String.fromCharCode(65 + index)}
              </span>
              <p className="min-w-0 flex-1 text-lg font-black leading-tight">{option.label}</p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                aria-label={`Remove a chip from ${option.label}`}
                disabled={pending || count === 0}
                onClick={() => assign(option.id, count - 1)}
                className="press-plate grid h-12 w-12 shrink-0 place-items-center border-2 border-[var(--ink)] bg-white text-2xl font-black"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={`${option.label} chips`}
                disabled={pending}
                value={count}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  assign(option.id, digits === "" ? 0 : Number(digits));
                }}
                className="display h-12 min-w-0 flex-1 border-2 border-[var(--ink)] bg-white text-center text-3xl tabular-nums focus:shadow-[4px_4px_0_var(--ink)]"
              />
              <button
                type="button"
                aria-label={`Add a chip to ${option.label}`}
                disabled={pending || remaining <= 0}
                onClick={() => assign(option.id, count + 1)}
                className="press-plate grid h-12 w-12 shrink-0 place-items-center border-2 border-[var(--ink)] bg-[var(--ink)] text-2xl font-black text-[var(--on-ink)]"
              >
                +
              </button>
            </div>
          </div>
        );
      })}

      {remaining !== 0 && (
        <p className="mono-tag text-[var(--ink-soft)]">
          {remaining} still to place before lock
        </p>
      )}
      <button
        type="button"
        disabled={pending || remaining !== 0}
        onClick={() => void commit()}
        className="press-plate block-shadow-sm min-h-14 w-full border-2 border-[var(--ink)] bg-[var(--red)] px-5 text-lg font-black uppercase text-[var(--on-red)] disabled:opacity-40"
      >
        {sealed ? "update my stack" : "lock the spend"}
      </button>
      {sealed && remaining === 0 && (
        <p className="mono-tag text-[var(--green)]">In the room. Change a stack and lock again.</p>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

export function OverUnderInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "over-under" }>;
  const { pending, error, run, restore } = useModeSubmit(activity, token);
  const restored = restore<{ side: "over" | "under"; confidence: number }>();
  const [side, setSide] = useState<"over" | "under" | null>(restored?.side ?? null);
  const [confidence, setConfidence] = useState(restored?.confidence ?? 70);
  const [sealed, setSealed] = useState(Boolean(restored));

  return (
    <div className="space-y-5">
      <p className="border-2 border-[var(--ink)] bg-[var(--paper-deep)] px-4 py-3 text-lg font-black">
        The line is {config.line} {config.unit}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["over", "under"] as const).map((candidate) => {
          const active = side === candidate;
          const color = candidate === "over" ? "var(--green)" : "var(--red)";
          return (
            <button
              key={candidate}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSide(candidate);
                setSealed(false);
              }}
              className="press-plate min-h-24 border-2 border-[var(--ink)] px-3 text-left block-shadow-sm"
              style={{
                background: active ? color : "var(--paper)",
                color: active ? onSurface(color) : "var(--ink)",
              }}
            >
              <span className="mono-tag">{candidate === "over" ? "above the line" : "below the line"}</span>
              <span className="display mt-2 block text-4xl">{candidate}</span>
            </button>
          );
        })}
      </div>
      <label className="block">
        <span className="mono-tag mb-2 block text-[var(--ink-soft)]">confidence {confidence}%</span>
        <input
          type="range"
          min={50}
          max={100}
          value={confidence}
          onChange={(event) => {
            setConfidence(Number(event.target.value));
            setSealed(false);
          }}
          className="w-full accent-[var(--ink)]"
        />
      </label>
      <button
        type="button"
        disabled={!side || pending}
        onClick={() => {
          if (!side) return;
          void run({ type: "over-under", side, confidence }).then((ok) => {
            if (ok) setSealed(true);
          });
        }}
        className="press-plate block-shadow-sm min-h-14 w-full border-2 border-[var(--ink)] bg-[var(--yellow)] px-5 text-lg font-black uppercase disabled:opacity-40"
      >
        {sealed ? "update my side" : "take the side"}
      </button>
      {sealed && (
        <p className="mono-tag text-[var(--green)]">Sealed. You can switch before the clock ends.</p>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

const FIST_VALUES = [0, 1, 2, 3, 4, 5] as const;

export function FistFiveInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "fist-five" }>;
  const { pending, error, run, restore } = useModeSubmit(activity, token);
  const stored = restore<{ value: number }>();
  const [value, setValue] = useState<number | null>(stored?.value ?? null);

  async function place(next: number) {
    if (pending || next === value) return;
    const ok = await run({ type: "fist-five", value: next });
    if (ok) setValue(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <span className="max-w-[45%] text-sm font-black leading-tight">{config.lowLabel}</span>
        <span className="max-w-[45%] text-right text-sm font-black leading-tight">{config.highLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {FIST_VALUES.map((level) => {
          const active = value === level;
          return (
            <motion.button
              key={level}
              type="button"
              whileTap={{ scale: 0.9 }}
              aria-pressed={active}
              disabled={pending}
              onClick={() => void place(level)}
              className="press-plate flex min-h-20 flex-col items-center justify-center border-2 border-[var(--ink)] sm:min-h-24"
              style={{
                background: active ? "var(--yellow)" : "white",
              }}
            >
              <span className="display text-4xl tabular-nums sm:text-5xl">{level}</span>
              <span className="mono-tag mt-1">
                {level === 0 ? "fist" : level === 5 ? "open" : `${level}`}
              </span>
            </motion.button>
          );
        })}
      </div>
      {value !== null ? (
        <p className="mono-tag text-[var(--green)]">Hand is up at {value}. Tap another number to move.</p>
      ) : (
        <p className="mono-tag text-[var(--ink-soft)]">Tap a number. 0 is a closed fist.</p>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

export function ChipStackStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "chip-stack" }> | null;
}) {
  const config = activity.config as Extract<Activity["config"], { type: "chip-stack" }>;
  const rows = config.options.map((option, index) => {
    const found = aggregate?.options.find((candidate) => candidate.id === option.id);
    return {
      ...option,
      index,
      chips: found?.chips ?? 0,
      share: found?.share ?? 0,
      average: found?.average ?? 0,
    };
  });
  const max = Math.max(1, ...rows.map((row) => row.chips));
  const leaderIds = new Set(aggregate?.leaderIds ?? []);

  const empty = !aggregate || aggregate.total === 0;

  return (
    <div className="space-y-6">
      {empty && (
        <p className="border-2 border-[var(--ink)] bg-[var(--paper-deep)] px-4 py-3 font-black">
          Waiting for the first chip. Spend lands here live.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const visibleChips = Math.min(12, Math.max(0, Math.round((row.chips / max) * 8)));
          return (
            <div key={row.id} className={`border-2 border-[var(--ink)] p-4 ${leaderIds.has(row.id) ? "bg-white block-shadow-sm" : "bg-[var(--paper)]"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xl font-black leading-tight">{row.label}</p>
                <AnimatedStat
                  value={Math.round(row.share)}
                  suffix="%"
                  className="display text-3xl"
                />
              </div>
              <div className="mt-3">
                <FillBar
                  share={row.share}
                  color={CHIP_COLORS[row.index % CHIP_COLORS.length]}
                  className="h-5 fill-hatch"
                />
              </div>
              <div className="mt-4 flex h-28 items-end justify-center gap-1" aria-hidden="true">
                {Array.from({ length: visibleChips }, (_, chipIndex) => (
                  <motion.span
                    key={`${row.id}-${chipIndex}`}
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: chipIndex * 0.04, type: "spring", stiffness: 380, damping: 18 }}
                    className="h-7 w-7 border-2 border-[var(--ink)]"
                    style={{
                      background: CHIP_COLORS[row.index % CHIP_COLORS.length],
                      marginBottom: chipIndex * 2,
                    }}
                  />
                ))}
              </div>
              <p className="mt-3 flex items-baseline gap-2">
                <AnimatedStat value={row.chips} className="display text-2xl" />
                <span className="mono-tag">
                  chips{leaderIds.has(row.id) ? " · leading" : ""}
                </span>
              </p>
            </div>
          );
        })}
      </div>
      {aggregate?.concentration != null && (
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[auto_1fr_auto] sm:gap-4">
          <span className="mono-tag text-[var(--ink-soft)]">spend focus</span>
          <FillBar share={aggregate.concentration} color="var(--ink)" className="h-3" />
          <AnimatedStat value={aggregate.concentration} className="display text-3xl" />
        </div>
      )}
    </div>
  );
}

export function OverUnderStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "over-under" }> | null;
}) {
  const config = activity.config as Extract<Activity["config"], { type: "over-under" }>;
  const overShare = aggregate?.overShare ?? 0;
  const underShare = aggregate && aggregate.total > 0 ? 100 - overShare : 0;
  const revealed = aggregate?.actual != null;
  const actual = revealed ? aggregate?.actual : null;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden border-2 border-[var(--ink)] bg-white px-5 py-6">
        <div
          aria-hidden="true"
          className="absolute inset-x-3 top-2 border-t-2 border-dashed border-[var(--ink)] opacity-40"
        />
        <p className="mono-tag">the published line</p>
        <p className="display mt-2 text-6xl md:text-8xl">
          {config.line}
          <span className="ml-3 text-3xl md:text-4xl">{config.unit}</span>
        </p>
        {(!aggregate || aggregate.total === 0) && (
          <p className="mt-3 font-black">Waiting for the first call.</p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border-2 border-[var(--ink)] bg-[var(--green)] p-5 text-[var(--on-green)]">
          <p className="mono-tag">over</p>
          <AnimatedStat
            value={Math.round(overShare)}
            suffix="%"
            className="display mt-2 block text-6xl md:text-7xl"
          />
          <p className="mono-tag mt-3">{aggregate?.overCount ?? 0} calls</p>
        </div>
        <div className="border-2 border-[var(--ink)] bg-[var(--red)] p-5 text-[var(--on-red)]">
          <p className="mono-tag">under</p>
          <AnimatedStat
            value={Math.round(underShare)}
            suffix="%"
            className="display mt-2 block text-6xl md:text-7xl"
          />
          <p className="mono-tag mt-3">{aggregate?.underCount ?? 0} calls</p>
        </div>
      </div>
      <FillBar share={overShare} color="var(--green)" className="h-6 fill-hatch" />
      {revealed && actual != null && (
        <div className="border-2 border-[var(--ink)] bg-[var(--yellow)] p-5 block-shadow-sm">
          <p className="mono-tag">the number landed</p>
          <p className="display mt-2 text-6xl md:text-7xl">
            {actual}
            <span className="ml-3 text-3xl">{config.unit}</span>
          </p>
          <p className="mt-3 text-xl font-black">
            {aggregate?.overWins ? "Over the line." : "Under the line."}
            {aggregate?.accuracy != null ? ` Room accuracy ${aggregate.accuracy}%.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

export function FistFiveStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "fist-five" }> | null;
}) {
  const config = activity.config as Extract<Activity["config"], { type: "fist-five" }>;
  const counts = aggregate?.counts ?? [0, 0, 0, 0, 0, 0];
  const max = Math.max(1, ...counts);
  const empty = !aggregate || aggregate.total === 0;
  const medianMark = aggregate?.median;

  return (
    <div className="space-y-6">
      {empty && (
        <p className="border-2 border-[var(--ink)] bg-[var(--paper-deep)] px-4 py-3 font-black">
          Waiting for the first hand.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {counts.map((count, level) => {
          const share = empty ? 0 : Math.round((count / max) * 100);
          const isMedian =
            medianMark != null &&
            Math.round(medianMark) === level &&
            (aggregate?.total ?? 0) > 0;
          return (
            <div
              key={level}
              className="flex min-w-0 flex-col border-2 border-[var(--ink)] bg-white p-2 sm:p-3"
              style={{ outline: isMedian ? "3px solid var(--yellow)" : undefined }}
            >
              <div className="relative">
                <FillColumn
                  share={share}
                  color={isMedian ? "var(--yellow)" : "var(--green)"}
                  className="h-36 sm:h-48"
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col-reverse items-center gap-1 p-1"
                  aria-hidden="true"
                >
                  {Array.from({ length: Math.min(count, 8) }, (_, index) => (
                    <span
                      key={index}
                      className="h-3 w-5 border-2 border-[var(--ink)] bg-[var(--paper)] sm:h-4 sm:w-6"
                    />
                  ))}
                </div>
              </div>
              <p className="display mt-2 text-center text-3xl tabular-nums sm:text-4xl">{level}</p>
              <AnimatedStat
                value={count}
                className="display mt-1 text-center text-xl tabular-nums"
              />
              {level === 0 && (
                <p className="mono-tag mt-1 text-center leading-tight">{config.lowLabel}</p>
              )}
              {level === 5 && (
                <p className="mono-tag mt-1 text-center leading-tight">{config.highLabel}</p>
              )}
            </div>
          );
        })}
      </div>
      {aggregate && aggregate.total > 0 && (
        <p className="mono-tag text-[var(--ink-soft)]">
          {aggregate.median != null ? `median hand ${aggregate.median}` : "median pending"}
          {aggregate.mean != null ? ` · mean ${aggregate.mean}` : ""}
          {` · ${aggregate.total} hands`}
        </p>
      )}
    </div>
  );
}
