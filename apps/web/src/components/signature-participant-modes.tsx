import type { Activity } from "@roomwave/shared";

import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import {
  type CommonModeInputProps as CommonProps,
  useModeSubmit as useSubmit,
} from "./mode-input-shared";
import { BlockButton, ErrorNote, Kicker } from "./ui";

function RangeField({
  label,
  value,
  onChange,
  low,
  high,
  min = 0,
  max = 1000,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  low: string;
  high: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const display = max === 1000 ? Math.round(value / 10) : value;
  return (
    <label className="block border-y-3 border-[var(--ink)] py-5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-black uppercase">{label}</span>
        <span className="display text-4xl tabular-nums">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 h-11 w-full accent-[var(--red)]"
        aria-valuetext={`${display} percent`}
      />
      <span className="mono-tag flex justify-between gap-4 text-[var(--ink-soft)]">
        <span>{low}</span>
        <span className="text-right">{high}</span>
      </span>
    </label>
  );
}

export function RealityBenderInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "reality-bender" }
  >;
  const { pending, error, run, restore } = useSubmit(activity, token);
  const restored = restore<{ personal: number; roomEstimate: number }>();
  const [personal, setPersonal] = useState(restored?.personal ?? 500);
  const [roomEstimate, setRoomEstimate] = useState(restored?.roomEstimate ?? 500);
  const [submitted, setSubmitted] = useState(Boolean(restored));

  return (
    <div className="space-y-6">
      <div className="border-l-8 border-[var(--red)] pl-4">
        <Kicker color="var(--red)">reality one</Kicker>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">Place your own answer first.</p>
      </div>
      <RangeField
        label="my answer"
        value={personal}
        onChange={(value) => {
          setPersonal(value);
          setSubmitted(false);
        }}
        low={config.lowLabel}
        high={config.highLabel}
      />
      <div className="border-l-8 border-[var(--violet)] pl-4">
        <Kicker color="var(--violet)">reality two</Kicker>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Now predict where the whole room will land.
        </p>
      </div>
      <RangeField
        label="room estimate"
        value={roomEstimate}
        onChange={(value) => {
          setRoomEstimate(value);
          setSubmitted(false);
        }}
        low={`room leans ${config.lowLabel}`}
        high={`room leans ${config.highLabel}`}
      />
      <BlockButton
        wide
        disabled={pending}
        color="var(--violet)"
        onClick={() =>
          void run({ type: "reality-bender", personal, roomEstimate }).then(setSubmitted)
        }
      >
        {pending ? "sealing…" : submitted ? "estimate sealed · update" : "seal both answers"}
      </BlockButton>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

export function LivingConsensusInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "living-consensus" }
  >;
  const { pending, error, run, restore } = useSubmit(activity, token);
  const restored = restore<{ value: number; confidence: number }>();
  const [value, setValue] = useState(restored?.value ?? 500);
  const [confidence, setConfidence] = useState(restored?.confidence ?? 70);
  const [submitted, setSubmitted] = useState(Boolean(restored));

  return (
    <div className="space-y-6">
      <p className="border-l-8 border-[var(--green)] pl-4 text-sm text-[var(--ink-soft)]">
        Your position changes the organism's height. Confidence changes its visual mass.
      </p>
      <RangeField
        label="position"
        value={value}
        onChange={(next) => {
          setValue(next);
          setSubmitted(false);
        }}
        low={config.lowLabel}
        high={config.highLabel}
      />
      <RangeField
        label="confidence"
        value={confidence}
        onChange={(next) => {
          setConfidence(next);
          setSubmitted(false);
        }}
        low="tentative"
        high="certain"
        max={100}
      />
      <BlockButton
        wide
        disabled={pending}
        color="var(--green)"
        onClick={() =>
          void run({ type: "living-consensus", value, confidence }).then(setSubmitted)
        }
      >
        {pending ? "joining…" : submitted ? "part of the organism · update" : "join the organism"}
      </BlockButton>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

function BranchChoice({
  branches,
  selected,
  onSelect,
  disabled = false,
}: {
  branches: Array<{ id: string; label: string }>;
  selected: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3" role="radiogroup" aria-label="Possible futures">
      {branches.map((branch, index) => {
        const active = branch.id === selected;
        return (
          <button
            key={branch.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onSelect(branch.id)}
            className={`grid min-h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-4 border-3 border-[var(--ink)] px-4 py-3 text-left transition-transform active:translate-x-1 disabled:opacity-70 ${
              active ? "bg-[var(--blue)] text-[var(--on-blue)] block-shadow-sm" : "bg-[var(--paper)]"
            }`}
          >
            <span className="display text-2xl">{String(index + 1).padStart(2, "0")}</span>
            <span className="font-black">{branch.label}</span>
            <span aria-hidden="true" className="text-2xl">{active ? "●" : "○"}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FutureForkInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "future-fork" }
  >;
  const reduceMotion = useReducedMotion();
  const { pending, error, run, restore } = useSubmit(activity, token);
  const restored = restore<{
    beforeBranchId: string;
    beforeLikelihood: number;
    afterBranchId?: string;
    afterLikelihood?: number;
  }>();
  const [beforeBranchId, setBeforeBranchId] = useState<string | null>(
    restored?.beforeBranchId ?? null,
  );
  const [beforeLikelihood, setBeforeLikelihood] = useState(restored?.beforeLikelihood ?? 60);
  const [evidenceOpen, setEvidenceOpen] = useState(Boolean(restored?.beforeBranchId));
  const [afterBranchId, setAfterBranchId] = useState<string | null>(
    restored?.afterBranchId ?? restored?.beforeBranchId ?? null,
  );
  const [afterLikelihood, setAfterLikelihood] = useState(
    restored?.afterLikelihood ?? restored?.beforeLikelihood ?? 60,
  );
  const [submitted, setSubmitted] = useState(Boolean(restored?.afterBranchId));

  return (
    <div className="space-y-6">
      <div>
        <Kicker>first forecast</Kicker>
        <div className="mt-4">
          <BranchChoice branches={config.branches} selected={beforeBranchId} onSelect={setBeforeBranchId} disabled={evidenceOpen} />
        </div>
      </div>
      <RangeField
        label="how likely?"
        value={beforeLikelihood}
        onChange={setBeforeLikelihood}
        low="unlikely"
        high="near certain"
        max={100}
        disabled={evidenceOpen}
      />
      {!evidenceOpen ? (
        <BlockButton
          wide
          disabled={pending || !beforeBranchId}
          color="var(--yellow)"
          onClick={() => {
            if (!beforeBranchId) return;
            void run({
              type: "future-fork",
              beforeBranchId,
              beforeLikelihood,
            }).then((ok) => {
              if (!ok) return;
              setAfterBranchId(beforeBranchId);
              setAfterLikelihood(beforeLikelihood);
              setEvidenceOpen(true);
            });
          }}
        >
          {pending ? "sealing forecast…" : "seal forecast, show evidence"}
        </BlockButton>
      ) : (
        <motion.div
          initial={reduceMotion ? false : { clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6"
        >
          <div className="border-4 border-[var(--ink)] bg-[var(--yellow)] p-5 block-shadow">
            <Kicker color="var(--red)">new information</Kicker>
            <p className="mt-3 text-lg font-black leading-snug text-[#17150f]">
              {config.evidenceDrop}
            </p>
          </div>
          <div>
            <Kicker color="var(--blue)">revised forecast</Kicker>
            <div className="mt-4">
              <BranchChoice branches={config.branches} selected={afterBranchId} onSelect={(id) => {
                setAfterBranchId(id);
                setSubmitted(false);
              }} />
            </div>
          </div>
          <RangeField
            label="likelihood now"
            value={afterLikelihood}
            onChange={(next) => {
              setAfterLikelihood(next);
              setSubmitted(false);
            }}
            low="unlikely"
            high="near certain"
            max={100}
          />
          <BlockButton
            wide
            disabled={pending || !beforeBranchId || !afterBranchId}
            color="var(--blue)"
            onClick={() =>
              void run({
                type: "future-fork",
                beforeBranchId,
                beforeLikelihood,
                afterBranchId,
                afterLikelihood,
              }).then(setSubmitted)
            }
          >
            {pending ? "rerouting…" : submitted ? "future recorded · update" : "record the reroute"}
          </BlockButton>
        </motion.div>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

export function CipherRoomInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<Activity["config"], { type: "cipher-room" }>;
  const { pending, error, run, restore } = useSubmit(activity, token);
  const restored = restore<{ shift: number; confidence: number }>();
  const [shift, setShift] = useState(restored?.shift ?? 0);
  const [confidence, setConfidence] = useState(restored?.confidence ?? 60);
  const [submitted, setSubmitted] = useState(Boolean(restored));

  return (
    <div className="space-y-6">
      <div className="overflow-hidden border-4 border-[var(--ink)] bg-[var(--ink)] p-5 text-[var(--paper)] block-shadow">
        <Kicker color="var(--yellow)">encrypted message</Kicker>
        <p className="display mt-4 break-words text-3xl tracking-[0.12em] sm:text-4xl">
          {config.ciphertext}
        </p>
        {config.clue && <p className="mono-tag mt-4 text-[var(--paper-deep)]">{config.clue}</p>}
      </div>
      <fieldset>
        <legend className="mono-tag text-[var(--ink-soft)]">choose the Caesar shift</legend>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-7">
          {Array.from({ length: 26 }, (_, value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setShift(value);
                setSubmitted(false);
              }}
              aria-pressed={shift === value}
              className={`aspect-square min-h-11 border-2 border-[var(--ink)] font-black tabular-nums ${
                shift === value ? "bg-[var(--yellow)] text-[#17150f] block-shadow-sm" : "bg-[var(--paper)]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>
      <RangeField
        label="confidence"
        value={confidence}
        onChange={(next) => {
          setConfidence(next);
          setSubmitted(false);
        }}
        low="testing"
        high="decoded"
        max={100}
      />
      <BlockButton
        wide
        disabled={pending}
        color="var(--yellow)"
        onClick={() => void run({ type: "cipher-room", shift, confidence }).then(setSubmitted)}
      >
        {pending ? "sealing…" : submitted ? `shift ${shift} sealed · update` : `seal shift ${shift}`}
      </BlockButton>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

function Sigil({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let hash = 2166136261;
    for (const character of seed) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Array.from({ length: 15 }, (_, index) => ((hash >>> (index % 24)) & 1) === 1);
  }, [seed]);

  return (
    <svg viewBox="0 0 5 5" className="h-11 w-11" aria-hidden="true" shapeRendering="crispEdges">
      {cells.flatMap((active, index) => {
        if (!active) return [];
        const x = index % 3;
        const y = Math.floor(index / 3);
        const mirror = 4 - x;
        return [
          <rect key={`${index}-a`} x={x} y={y} width="1" height="1" fill="currentColor" />,
          ...(mirror === x
            ? []
            : [<rect key={`${index}-b`} x={mirror} y={y} width="1" height="1" fill="currentColor" />]),
        ];
      })}
    </svg>
  );
}

export function ShadowCouncilInput({ activity, token }: CommonProps) {
  const config = activity.config as Extract<
    Activity["config"],
    { type: "shadow-council" }
  >;
  const { pending, error, run, restore } = useSubmit(activity, token);
  const restored = restore<{
    allocations: Array<{ aliasId: string; points: number }>;
    banishId: string;
    confidence: number;
  }>();
  const [points, setPoints] = useState<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    for (const allocation of restored?.allocations ?? []) {
      next[allocation.aliasId] = allocation.points;
    }
    return next;
  });
  const [banishId, setBanishId] = useState<string | null>(restored?.banishId ?? null);
  const [confidence, setConfidence] = useState(restored?.confidence ?? 70);
  const [submitted, setSubmitted] = useState(Boolean(restored?.banishId));
  const spent = Object.values(points).reduce((sum, value) => sum + value, 0);
  const remaining = config.suspicionPoints - spent;

  function changePoint(aliasId: string, delta: number) {
    setPoints((current) => {
      const currentValue = current[aliasId] ?? 0;
      const nextValue = Math.max(0, Math.min(config.suspicionPoints, currentValue + delta));
      const currentSpent = Object.values(current).reduce((sum, value) => sum + value, 0);
      const nextSpent = currentSpent - currentValue + nextValue;
      if (nextSpent > config.suspicionPoints) return current;
      const next = { ...current, [aliasId]: nextValue };
      if (nextValue === 0) delete next[aliasId];
      return next;
    });
    setSubmitted(false);
  }

  return (
    <div className="space-y-6">
      <div className="border-4 border-[var(--ink)] bg-[var(--yellow)] p-5 block-shadow">
        <Kicker color="var(--red)">observed evidence</Kicker>
        <p className="mt-3 text-lg font-black leading-snug text-[#17150f]">{config.evidence}</p>
      </div>
      <div className="flex items-end justify-between gap-4 border-b-4 border-[var(--ink)] pb-3">
        <div>
          <Kicker>suspicion budget</Kicker>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">Place all three marks, then choose one tribunal target.</p>
        </div>
        <span className="display text-5xl tabular-nums">{remaining}</span>
      </div>
      <div className="space-y-3">
        {config.aliases.map((alias) => {
          const count = points[alias.id] ?? 0;
          const banish = banishId === alias.id;
          return (
            <div
              key={alias.id}
              className={`grid grid-cols-[auto_1fr] gap-3 border-3 border-[var(--ink)] p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center ${
                banish ? "bg-[var(--red)] text-[var(--on-red)] block-shadow-sm" : "bg-[var(--paper)]"
              }`}
            >
              <Sigil seed={alias.id} />
              <div>
                <p className="display text-xl uppercase">{alias.label}</p>
                <p className="mono-tag mt-1">suspicion {"◆".repeat(count) || "none"}</p>
              </div>
              <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1 sm:flex">
                <button
                  type="button"
                  disabled={count === 0}
                  onClick={() => changePoint(alias.id, -1)}
                  className="min-h-11 border-2 border-current px-3 font-black disabled:opacity-30"
                  aria-label={`Remove suspicion from ${alias.label}`}
                >
                  −
                </button>
                <button
                  type="button"
                  disabled={remaining === 0}
                  onClick={() => changePoint(alias.id, 1)}
                  className="min-h-11 border-2 border-current px-3 font-black disabled:opacity-30"
                  aria-label={`Add suspicion to ${alias.label}`}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBanishId(alias.id);
                    setSubmitted(false);
                  }}
                  className={`min-h-11 border-2 border-current px-3 font-black uppercase ${
                    banish ? "bg-[var(--ink)] text-[var(--paper)]" : ""
                  }`}
                >
                  {banish ? "target" : "banish"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <RangeField
        label="tribunal confidence"
        value={confidence}
        onChange={(next) => {
          setConfidence(next);
          setSubmitted(false);
        }}
        low="50 · uncertain"
        high="100 · certain"
        min={50}
        max={100}
      />
      <BlockButton
        wide
        disabled={pending || remaining !== 0 || !banishId}
        color="var(--red)"
        onClick={() =>
          void run({
            type: "shadow-council",
            allocations: Object.entries(points).map(([aliasId, pointCount]) => ({
              aliasId,
              points: pointCount,
            })),
            banishId,
            confidence,
          }).then(setSubmitted)
        }
      >
        {pending ? "sealing…" : submitted ? "tribunal sealed · update" : "seal the tribunal"}
      </BlockButton>
      {error && <ErrorNote message={error} />}
    </div>
  );
}
