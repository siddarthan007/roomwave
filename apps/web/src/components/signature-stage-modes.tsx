import type { Activity, ActivityAggregate } from "@roomwave/shared";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { onSurface } from "./surface-color";

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t-3 border-[var(--ink)] pt-2">
      <p className="mono-tag text-[var(--ink-soft)]">{label}</p>
      <p className="display mt-1 text-3xl tabular-nums md:text-5xl">{children}</p>
    </div>
  );
}

function bins(values: number[], count = 12) {
  const result = Array.from({ length: count }, () => 0);
  for (const value of values) {
    const index = Math.min(count - 1, Math.floor((Math.max(0, Math.min(1000, value)) / 1001) * count));
    result[index] += 1;
  }
  return result;
}

export function RealityBenderStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "reality-bender" }> | null;
}) {
  const reduceMotion = useReducedMotion();
  const config = activity.config as Extract<Activity["config"], { type: "reality-bender" }>;
  const personalBins = bins(aggregate?.personalValues ?? []);
  const estimateBins = bins(aggregate?.estimateValues ?? []);
  const maximum = Math.max(1, ...personalBins, ...estimateBins);

  if (!aggregate) {
    return (
      <div className="grid min-h-[44vh] place-items-center border-y-4 border-[var(--ink)]">
        <div className="text-center">
          <p className="mono-tag text-[var(--violet)]">two realities collecting</p>
          <p className="display mt-3 text-[clamp(2.5rem,7vw,6rem)]">PRIVATE ≠ PERCEIVED</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.72fr] lg:items-stretch">
      <div className="relative min-h-[48vh] overflow-hidden border-4 border-[var(--ink)] bg-[var(--paper-deep)] p-5 block-shadow">
        <div className="absolute inset-x-5 top-5 flex items-center justify-between">
          <span className="mono-tag text-[var(--violet)]">what the room expected</span>
          <span className="mono-tag text-[var(--red)]">what the room is</span>
        </div>
        <div className="absolute inset-x-5 bottom-16 top-16 grid grid-cols-12 items-end gap-1">
          {estimateBins.map((count, index) => (
            <motion.div
              key={`ghost-${index}`}
              initial={reduceMotion ? false : { height: 0 }}
              animate={{ height: `${10 + (count / maximum) * 40}%` }}
              transition={{ duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : index * 0.025 }}
              className="self-start border-2 border-dashed border-[var(--violet)] bg-transparent"
            />
          ))}
          {personalBins.map((count, index) => (
            <motion.div
              key={`real-${index}`}
              initial={reduceMotion ? false : { height: 0 }}
              animate={{ height: `${10 + (count / maximum) * 40}%` }}
              transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : 0.22 + index * 0.02 }}
              className="self-end bg-[var(--red)]"
            />
          ))}
        </div>
        <div className="absolute inset-x-5 bottom-5 flex justify-between text-sm font-black uppercase">
          <span>{config.lowLabel}</span>
          <span>{config.highLabel}</span>
        </div>
      </div>
      <div className="flex flex-col justify-between border-y-4 border-[var(--ink)] py-5">
        <div>
          <p className="mono-tag text-[var(--ink-soft)]">the distortion</p>
          <motion.p
            key={aggregate.perceptionGap}
            initial={reduceMotion ? false : { x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="display mt-2 text-[clamp(4.5rem,12vw,10rem)] leading-none text-[var(--violet)]"
          >
            {aggregate.perceptionGap > 0 ? "+" : ""}{aggregate.perceptionGap}
          </motion.p>
          <p className="text-lg font-black">percentage points</p>
          <p className="mt-3 max-w-sm text-[var(--ink-soft)]">
            {aggregate.perceptionGap === 0
              ? "The room read itself exactly."
              : aggregate.perceptionGap > 0
                ? "The room expected a higher answer than people actually gave."
                : "The room expected a lower answer than people actually gave."}
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <Readout label="actual mean">{Math.round(aggregate.actualMean / 10)}%</Readout>
          <Readout label="expected mean">{Math.round(aggregate.expectedMean / 10)}%</Readout>
          <Readout label="misread room">{aggregate.misreadShare}%</Readout>
          <Readout label="projection link">
            {aggregate.projectionCorrelation === null ? "n/a" : aggregate.projectionCorrelation}
          </Readout>
        </div>
      </div>
    </div>
  );
}

export function LivingConsensusStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "living-consensus" }> | null;
}) {
  const reduceMotion = useReducedMotion();
  const config = activity.config as Extract<Activity["config"], { type: "living-consensus" }>;
  const values = aggregate?.values.slice(-120) ?? [];
  const points = values.map((value, index) => {
    const column = index % 20;
    const row = Math.floor(index / 20);
    const jitter = ((index * 47) % 17) - 8;
    return {
      x: 50 + column * 45 + jitter,
      y: 350 - value * 0.25 + row * 7 + (((index * 29) % 13) - 6),
    };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
      <div className="relative min-h-[50vh] overflow-hidden border-y-4 border-[var(--ink)] bg-[var(--paper-deep)]">
        <svg viewBox="0 0 1000 420" className="absolute inset-0 h-full w-full" role="img" aria-label={`Living data sculpture from ${aggregate?.total ?? 0} responses`}>
          <motion.path
            d={path || "M500,210 L500,210"}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={aggregate ? 1 + (aggregate.consensus ?? 0) / 18 : 1}
            strokeOpacity={aggregate ? 0.22 + (aggregate.consensus ?? 0) / 130 : 0.15}
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduceMotion ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
          {points.map((point, index) => (
            <motion.rect
              key={index}
              x={point.x - 5}
              y={point.y - 5}
              width={10 + ((index * 7) % 8)}
              height={10 + ((index * 7) % 8)}
              fill={index % 3 === 0 ? "var(--red)" : index % 3 === 1 ? "var(--blue)" : "var(--yellow)"}
              stroke="var(--ink)"
              strokeWidth="2"
              initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.008, 0.5) }}
            />
          ))}
          {points.length === 0 && (
            <text x="500" y="215" textAnchor="middle" fill="var(--ink-soft)" className="mono-tag">
              THE ORGANISM IS WAITING
            </text>
          )}
        </svg>
        <div className="absolute inset-x-4 bottom-3 flex justify-between font-black uppercase">
          <span>{config.lowLabel}</span><span>{config.highLabel}</span>
        </div>
      </div>
      <div className="grid min-w-52 grid-cols-2 gap-4 lg:grid-cols-1">
        <Readout label="weighted position">{aggregate ? Math.round(aggregate.confidenceWeightedMean / 10) : 0}</Readout>
        <Readout label="coherence">{aggregate?.consensus ?? 0}%</Readout>
        <Readout label="confidence">{aggregate?.confidence ?? 0}%</Readout>
        <Readout label="responses">{aggregate?.total ?? 0}</Readout>
      </div>
    </div>
  );
}

export function FutureForkStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "future-fork" }> | null;
}) {
  const reduceMotion = useReducedMotion();
  const config = activity.config as Extract<Activity["config"], { type: "future-fork" }>;
  const branches = aggregate?.branches ?? config.branches.map((branch) => ({
    ...branch,
    beforeShare: 0,
    afterShare: 0,
    beforeLikelihood: 0,
    afterLikelihood: 0,
  }));
  const width = 900;
  const positions = branches.map((branch, index) => ({
    ...branch,
    x: ((index + 1) * width) / (branches.length + 1),
  }));

  return (
    <div className="space-y-5">
      <div className="border-4 border-[var(--ink)] bg-[var(--yellow)] px-5 py-4 text-[#17150f] block-shadow-sm">
        <span className="mono-tag text-[var(--red)]">information shock</span>
        <span className="ml-4 font-black">{config.evidenceDrop}</span>
      </div>
      <div className="relative min-h-[46vh] overflow-hidden border-y-4 border-[var(--ink)]">
        <svg viewBox="0 0 900 430" className="absolute inset-0 h-full w-full" role="img" aria-label={`Future tree with ${branches.length} branches`}>
          <rect x="422" y="20" width="56" height="56" fill="var(--ink)" />
          <text x="450" y="105" textAnchor="middle" fill="var(--ink)" fontWeight="900">NOW</text>
          {positions.map((branch, index) => {
            const color = index % 3 === 0 ? "var(--red)" : index % 3 === 1 ? "var(--blue)" : "var(--green)";
            return (
              <g key={branch.id}>
                <path
                  d={`M450,76 C450,175 ${branch.x},170 ${branch.x},300`}
                  fill="none"
                  stroke="var(--ink-soft)"
                  strokeDasharray="8 10"
                  strokeWidth={2 + branch.beforeShare / 10}
                  opacity="0.48"
                />
                <motion.path
                  d={`M450,76 C450,175 ${branch.x},170 ${branch.x},300`}
                  fill="none"
                  stroke={color}
                  strokeWidth={3 + branch.afterShare / 7}
                  initial={reduceMotion ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.8, delay: reduceMotion ? 0 : index * 0.08 }}
                />
                <motion.rect
                  x={branch.x - 58}
                  y="290"
                  width="116"
                  height="78"
                  fill={color}
                  stroke="var(--ink)"
                  strokeWidth="4"
                  initial={reduceMotion ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  style={{ transformOrigin: `${branch.x}px 368px` }}
                />
                <text x={branch.x} y="324" textAnchor="middle" fill={onSurface(color)} fontSize="24" fontWeight="900">{branch.afterShare}%</text>
                <text x={branch.x} y="350" textAnchor="middle" fill={onSurface(color)} fontSize="14" fontWeight="800">WAS {branch.beforeShare}%</text>
                <text x={branch.x} y="405" textAnchor="middle" fill="var(--ink)" fontSize="14" fontWeight="900">{branch.label.toUpperCase().slice(0, 18)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Readout label="changed path">{aggregate?.changedShare ?? 0}%</Readout>
        <Readout label="confidence shift">{aggregate ? `${aggregate.confidenceShift > 0 ? "+" : ""}${aggregate.confidenceShift}` : 0}</Readout>
        <Readout label="visible flows">{aggregate?.flows.length ?? 0}</Readout>
        <Readout label="revisions">{aggregate ? `${aggregate.revisedTotal}/${aggregate.total}` : "0/0"}</Readout>
      </div>
    </div>
  );
}

export function CipherRoomStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "cipher-room" }> | null;
}) {
  const reduceMotion = useReducedMotion();
  const config = activity.config as Extract<Activity["config"], { type: "cipher-room" }>;
  const distribution = aggregate?.distribution ?? Array.from({ length: 26 }, () => 0);
  const maximum = Math.max(1, ...distribution);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr] lg:items-center">
      <div className="border-4 border-[var(--ink)] bg-[var(--ink)] p-6 text-[var(--paper)] block-shadow">
        <p className="mono-tag text-[var(--yellow)]">encrypted message</p>
        <p className="display mt-5 break-words text-[clamp(2.2rem,5vw,5rem)] leading-tight tracking-[0.1em]">{config.ciphertext}</p>
        <AnimatePresence>
          {aggregate?.correctShift !== null && aggregate?.correctShift !== undefined && (
            <motion.div
              initial={reduceMotion ? false : { clipPath: "inset(0 100% 0 0)" }}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              className="mt-7 border-y-3 border-[var(--yellow)] py-4"
            >
              <p className="mono-tag text-[var(--paper-deep)]">wheel locked</p>
              <p className="display mt-1 text-6xl text-[var(--yellow)]">SHIFT {aggregate.correctShift}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div>
        <svg viewBox="0 0 520 520" className="mx-auto aspect-square max-h-[52vh] w-full" role="img" aria-label="Caesar shift answer wheel">
          <circle cx="260" cy="260" r="178" fill="var(--paper-deep)" stroke="var(--ink)" strokeWidth="4" />
          {distribution.map((count, shift) => {
            const angle = (shift / 26) * Math.PI * 2 - Math.PI / 2;
            const radius = 155 + (count / maximum) * 42;
            const x = 260 + Math.cos(angle) * radius;
            const y = 260 + Math.sin(angle) * radius;
            const correct = aggregate?.correctShift === shift;
            return (
              <motion.g key={shift} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : shift * 0.012 }}>
                <line x1={260 + Math.cos(angle) * 140} y1={260 + Math.sin(angle) * 140} x2={x} y2={y} stroke={correct ? "var(--red)" : "var(--ink)"} strokeWidth={correct ? 7 : 2} />
                <circle cx={x} cy={y} r={correct ? 24 : 17} fill={correct ? "var(--red)" : count > 0 ? "var(--yellow)" : "var(--paper)"} stroke="var(--ink)" strokeWidth="3" />
                <text x={x} y={y + 5} textAnchor="middle" fill={correct ? "white" : "#17150f"} fontWeight="900" fontSize="14">{shift}</text>
              </motion.g>
            );
          })}
          <text x="260" y="245" textAnchor="middle" fill="var(--ink)" fontSize="18" fontWeight="900">ROOM CHOICE</text>
          <text x="260" y="290" textAnchor="middle" fill="var(--ink)" fontSize="48" fontWeight="900">{aggregate?.mostCommonShift ?? "?"}</text>
        </svg>
        <div className="grid grid-cols-3 gap-4">
          <Readout label="decoded">{aggregate?.accuracy ?? 0}%</Readout>
          <Readout label="confidence">{aggregate?.averageConfidence ?? 0}%</Readout>
          <Readout label="wheel consensus">{aggregate?.consensus ?? 0}%</Readout>
        </div>
      </div>
    </div>
  );
}

function StageSigil({ seed }: { seed: string }) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const cells = Array.from({ length: 15 }, (_, index) => ((hash >>> (index % 24)) & 1) === 1);
  return (
    <svg viewBox="0 0 5 5" className="mx-auto h-16 w-16" aria-hidden="true" shapeRendering="crispEdges">
      {cells.flatMap((active, index) => {
        if (!active) return [];
        const x = index % 3;
        const y = Math.floor(index / 3);
        return [x, 4 - x].filter((value, cellIndex, array) => array.indexOf(value) === cellIndex).map((cellX) => (
          <rect key={`${index}-${cellX}`} x={cellX} y={y} width="1" height="1" fill="currentColor" />
        ));
      })}
    </svg>
  );
}

export function ShadowCouncilStage({
  activity,
  aggregate,
}: {
  activity: Activity;
  aggregate: Extract<ActivityAggregate, { type: "shadow-council" }> | null;
}) {
  const reduceMotion = useReducedMotion();
  const config = activity.config as Extract<Activity["config"], { type: "shadow-council" }>;
  const aliases = aggregate?.aliases ?? config.aliases.map((alias) => ({
    ...alias,
    suspicion: 0,
    banishVotes: 0,
    heat: 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y-4 border-[var(--ink)] py-3">
        <p><span className="mono-tag text-[var(--red)]">observed</span><span className="ml-3 font-black">{config.evidence}</span></p>
        <p className="mono-tag text-[var(--ink-soft)]">heat = allocated suspicion · identity = sealed truth</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {aliases.map((alias, index) => {
          const isShadow = aggregate?.shadowAliasId === alias.id;
          return (
            <motion.div
              key={alias.id}
              layout
              initial={reduceMotion ? false : { y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : index * 0.06 }}
              className={`relative overflow-hidden border-4 border-[var(--ink)] p-5 text-center ${
                isShadow ? "bg-[var(--red)] text-[var(--on-red)] block-shadow" : "bg-[var(--paper-deep)]"
              }`}
            >
              {!isShadow && alias.heat > 0 && (
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-[var(--yellow)] opacity-70" style={{ height: `${alias.heat}%` }} />
              )}
              <div className="relative">
                <StageSigil seed={alias.id} />
                <p className="display mt-3 text-3xl uppercase">{alias.label}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t-2 border-current pt-3">
                  <p><span className="mono-tag block opacity-70">suspicion</span><span className="display text-3xl">{alias.heat}%</span></p>
                  <p><span className="mono-tag block opacity-70">banish</span><span className="display text-3xl">{alias.banishVotes}</span></p>
                </div>
                {isShadow && <p className="mt-4 border-2 border-current py-2 font-black uppercase tracking-[0.16em]">Shadow revealed</p>}
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Readout label="room accuracy">{aggregate?.accuracy ?? 0}%</Readout>
        <Readout label="tribunal consensus">{aggregate?.tribunalConsensus ?? 0}%</Readout>
        <Readout label="confidence">{aggregate?.averageConfidence ?? 0}%</Readout>
        <Readout label="sealed votes">{aggregate?.total ?? 0}</Readout>
      </div>
    </div>
  );
}
