# 002 — Live reveal analytics: count-up numbers and animated share rails for every mode stage

- **Status**: TODO
- **Commit**: 735b33e
- **Severity**: HIGH
- **Category**: Missed opportunities / live-data feel
- **Estimated scope**: 2 new files + small edits in stage-modes.tsx, ~150 lines

## Problem

Stage aggregates update live over SSE, but most numeric displays teleport:
`{Math.round(row.percentage)}` (stage-modes.tsx:85), `{aggregate.consensus}`
(:130), `{String(Math.round(median! / 10))}` (:205). On a projector, a vote
landing makes the number *jump* — no continuity between old and new value.
Bars animate (springs exist on lanes at :95) but the numbers beside them do
not, which reads as half-alive. The percentage text is also plain
`tabular-nums` — it re-renders as flat text.

The curated-library answer for exactly this is **NumberFlow**
(https://number-flow.barvian.me): animating a number by re-rendering text is
a listed anti-pattern; NumberFlow handles digit transitions properly
(spinner-style digit columns, respects `prefers-reduced-motion`, spring
physics, SSR-safe).

## Target

1. Add the dependency:

```bash
cd apps/web && bun add @number-flow/react
```

2. Create `apps/web/src/components/AnimatedStat.tsx`:

```tsx
import NumberFlow from "@number-flow/react";

/**
 * Live-updating numeric readout for the stage. Digit transitions run on
 * NumberFlow's internal spring; reduced-motion users get instant swaps.
 * `format` lets modes render percentages ("42%") or raw counts.
 */
export function AnimatedStat({
  value,
  suffix,
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <NumberFlow
        value={value}
        transformTiming={{ duration: 450, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}
        spinTiming={{ duration: 450, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}
        willChange
      />
      {suffix}
    </span>
  );
}
```

3. Replace teleporting numerals in `apps/web/src/components/stage-modes.tsx`:
   - PulseChoiceStage percentage (:84–87):
     `<AnimatedStat value={Math.round(row.percentage)} suffix="%" className="display text-4xl md:text-5xl" />`
     keeping the inner `%` sizing by passing it as `suffix`.
   - Consensus number (:129–131): same pattern, suffix removed.
   - Spectrum median stat (:204–206): `<AnimatedStat value={values.length > 0 ? Math.round(median! / 10) : 0} />`.
4. Same treatment for `ArrivalCounter` in `apps/web/src/pages/StagePage.tsx`
   (:30–42): keep the red-flash kick (it marks arrivals) but let NumberFlow
   render the digits so multi-digit churn rolls instead of snapping.

## Repo conventions to follow

- New components go in `apps/web/src/components/` as named exports.
- The repo's display type class is `display`; pass existing classNames through
  `className` props rather than restyling inside AnimatedStat.
- Motion tokens: use `[0.23, 1, 0.32, 1]` (plan 001's `--ease-out-strong`
  equivalent) — matches the stamp/question entrances.

## Steps

1. `cd apps/web && bun add @number-flow/react`.
2. Create `AnimatedStat.tsx` with the exact code above.
3. Apply the four call-site replacements listed in Target.
4. `bun run check`.

## Boundaries

- Do NOT replace the momentum rail or consensus bar widths — those already
  spring correctly.
- Do NOT touch participant-facing pages (phone keyboards must stay instant).
- If NumberFlow's bundle exceeds ~15kB gzipped added to the stage chunk,
  STOP and report before proceeding.

## Verification

- **Mechanical**: `bun run check` green; build output shows the stage chunk
  grew by less than ~15kB gzip.
- **Feel check**: open stage + one participant; vote repeatedly and watch:
  - digits roll vertically (odometer), never snap;
  - rapid votes retarget smoothly mid-roll (NumberFlow springs are
    interruptible);
  - toggle `prefers-reduced-motion` → digits swap instantly, no roll.
- **Done when**: no bare `{Math.round(...)}` teleports remain in stage-modes
  percentage/median/consensus positions.

## Context7 reference

Verified via context7 `motion.dev` docs that this repo's Motion version does
not provide digit-rolling primitives; NumberFlow is the dedicated tool
(curated list: "Animating a number by re-rendering text → NumberFlow handles
digit transitions properly").
