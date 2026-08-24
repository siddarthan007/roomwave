# 003 — scale(0) entrances and missing reduced-motion gates in stage modes

- **Status**: TODO
- **Commit**: 735b33e
- **Severity**: HIGH
- **Category**: Physicality & origin / Accessibility
- **Estimated scope**: 3 files, ~10 line edits

## Problem

Two violations of AUDIT.md §3 and §6 in the signature stage modes:

1. `apps/web/src/components/signature-stage-modes.tsx:160`:
   `initial={reduceMotion ? false : { scale: 0, opacity: 0 }}` — things
   appearing from nothing. Nothing in the physical world scales from zero;
   target range is `scale(0.9–0.97)` + opacity 0.

2. `apps/web/src/components/stage-modes.tsx:257` (Word Bloom):
   `initial={{ scale: 0.25, opacity: 0, rotate: -8 }}` — 0.25 is far below
   the 0.9–0.97 floor; words materialize from tiny shards instead of
   pressing in like ink.

3. Several stage-mode springs have no reduced-motion gate at all. The repo's
   convention exists (`useReducedMotion()` + `initial={reduce ? false : ...}`,
   see ReactionLayer.tsx:58) but only 6 files use it; the mode stages with
   entrance springs (stage-modes.tsx Word Bloom :257, Prediction guess cloud
   :424) run their motion regardless of the OS setting.

## Target

```tsx
// signature-stage-modes.tsx:160 — target
initial={reduceMotion ? false : { scale: 0.94, opacity: 0 }}

// stage-modes.tsx:257 (Word Bloom) — ink-press entrance, gated
const reduceMotion = useReducedMotion();
initial={reduceMotion ? false : { scale: 0.92, opacity: 0, rotate: -8 }}
```

Every gate uses the existing hook import from `motion/react`.

## Repo conventions to follow

- Exemplar of the correct gate pattern: `ReactionLayer.tsx` lines 58–71 —
  `const shouldReduceMotion = useReducedMotion();` then ternary on initial.
- Stage components already import from `motion/react`; add
  `useReducedMotion` to that import list where missing.

## Steps

1. `signature-stage-modes.tsx`: change `scale: 0` → `scale: 0.94`.
2. `stage-modes.tsx` WordBloomStage: add `useReducedMotion`, gate the initial,
   raise `scale: 0.25` → `scale: 0.92`.
3. `stage-modes.tsx` PredictionStage guess cloud (:424 spring with delay
   stagger): same gate, keep the stagger values.
4. Sweep remaining `initial={{` in both files for any other ungated motion
   with movement; gate them identically. Pure opacity fades may stay ungated.
5. `bun run check`.

## Boundaries

- Do NOT touch exit animations (they are already opacity-only).
- Do NOT gate the median-marker rail slide (:194) — it is data-driven
  position, not decorative; reduced motion keeps position changes that aid
  comprehension per AUDIT.md §6.
- No new dependencies.

## Verification

- **Mechanical**: `bun run check` green.
- **Feel check**: open a word-bloom round on the projector view; words press
  in like stamps (small scale + tilt), not shards. Toggle
  `prefers-reduced-motion` in DevTools Rendering panel → words appear without
  movement but still fade in.
- **Done when**: zero `scale: 0` or sub-0.9 initial scales remain in
  apps/web/src; every transform-bearing entrance in stage-modes +
  signature-stage-modes is behind the hook.
