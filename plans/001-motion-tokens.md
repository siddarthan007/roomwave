# 001 — Motion token system: shared easing + duration scale

- **Status**: TODO
- **Commit**: 735b33e
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (index.css), ~20 lines added

## Problem

Motion values are hand-typed inline across components. There are at least four
different spring configs (`stiffness: 120/damping: 20`, `stiffness: 90/damping:
20`, `stiffness: 170/damping: 24`, `stiffness: 420/damping: 32`) and two
hand-written cubic-beziers (`[0.2, 0.9, 0.2, 1]` in StagePage.tsx:212 and the
stamp keyframe in index.css). Nothing is named; tuning "the feel" means
hunting through nine files.

Current exemplars of the duplication:

```css
/* apps/web/src/index.css — stamp keyframe */
animation: rw-stamp-in 0.42s cubic-bezier(0.2, 0.9, 0.2, 1) both;
```

```tsx
// apps/web/src/pages/StagePage.tsx:212 — question entrance
transition={{ duration: 0.45, ease: [0.2, 0.9, 0.2, 1] }}
```

## Target

Add a motion-token block to `:root` in `apps/web/src/index.css`, immediately
after the color tokens (~line 40):

```css
/* Motion tokens: strong custom curves per AUDIT.md §2. ease-out for anything
   entering/exiting, ease-in-out for on-screen movement. Durations stay under
   300ms for UI; the stage's explanatory moments may run longer. */
--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
--ease-inout-strong: cubic-bezier(0.77, 0, 0.175, 1);
--dur-fast: 150ms;
--dur-ui: 250ms;
--dur-stage: 450ms;
```

Then replace the hand-typed values where they appear:

```css
/* index.css stamp keyframe — target */
animation: rw-stamp-in var(--dur-stage) var(--ease-out-strong) both;
```

```tsx
// StagePage.tsx question entrance — target
transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
```

(Spring configs stay inline for now — Motion springs are JS objects, not CSS
tokens; consolidating them into a TS constant module is plan 002.)

## Repo conventions to follow

- Tokens live in the `:root` block at the top of `apps/web/src/index.css`;
  existing examples: `--paper-deep`, `--ink-soft` (lines ~15–35).
- The file uses plain CSS custom properties consumed by Tailwind arbitrary
  values like `bg-[var(--ink)]`.

## Steps

1. Open `apps/web/src/index.css`. Locate the `:root { ... }` block. After its
   last color declaration, add the six motion tokens from the Target section.
2. In the same file, find `.rw-reveal-stamp > *` and change
   `0.42s cubic-bezier(0.2, 0.9, 0.2, 1)` to
   `var(--dur-stage) var(--ease-out-strong)`.
3. In `apps/web/src/pages/StagePage.tsx` (~line 212, question h1 transition),
   change `ease: [0.2, 0.9, 0.2, 1]` to `ease: [0.23, 1, 0.32, 1]`.
4. Run `bun run check` from the repo root; expect all green.

## Boundaries

- Do NOT touch spring props in TSX (separate plan).
- Do NOT rename existing color tokens.
- Do NOT add new files.

## Verification

- **Mechanical**: `bun run check` passes from repo root.
- **Feel check**: load a stage, trigger reveal. The result block should still
  stamp in decisively; the curve change from `[0.2,0.9,0.2,1]` to
  `[0.23,1,0.32,1]` is subtle (slightly longer settle) — confirm it does not
  feel slower.
- **Done when**: tokens exist in `:root`, both hand-typed curves reference
  them or their exact values, suite green.
