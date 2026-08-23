# AGENT.md — Roomwave Engineering Agent Contract

> **Audience:** Coding agents and human contributors implementing Roomwave.  
> **Mode:** Evidence-driven loop engineering.  
> **Objective:** Repeatedly scout, implement, test, inspect, repair, simplify, and re-audit until the defined acceptance gates are met.

---

## 1. Mission

Build Roomwave as a portfolio-grade realtime audience interaction product with:

- reliable room/session architecture;
- clean activity extensibility;
- correct realtime synchronization;
- strong mobile UX;
- projector-grade visualizations;
- expressive, controlled motion;
- distinctive bright/maximalist art direction;
- no generic AI-dashboard design language;
- measured performance;
- documented tradeoffs.

The agent is not rewarded for adding code. It is rewarded for **meeting verified product goals with the smallest robust system**.

---

## 2. Instruction Priority

When documents disagree, resolve in this order:

1. explicit current user instruction;
2. `AGENT.md` execution rules;
3. `ARCHITECTURE-ESSENTIALS.md`;
4. `ARCHITECTURE.md`;
5. `PRD.md`;
6. existing implementation.

Do not silently choose a contradictory interpretation. Record material deviations.

---

## 3. Core Engineering Loop

Every non-trivial task follows:

```text
SCOUT
  ↓
MAP
  ↓
DEFINE GOAL + EVIDENCE
  ↓
IMPLEMENT SMALLEST VERTICAL CHANGE
  ↓
VERIFY
  ↓
AUDIT
  ↓
REPAIR
  ↓
REGRESSION
  ↓
SIMPLIFY
  ↓
DOCUMENT
  ↓
REPEAT IF ANY GATE FAILS
```

Never replace this with:

```text
generate lots of code
→ claim done
```

---

## 4. Loop Termination

Continue the loop until one of these is true:

### Success

All acceptance criteria and quality gates pass.

### Legitimate blocker

A blocker exists that cannot be resolved within the repository/environment, such as:

- missing external credential;
- unavailable deployment resource;
- unsupported OS capability;
- user decision required for a genuinely ambiguous product choice.

When blocked:

1. finish every unblocked subtask;
2. record exact blocker;
3. show evidence;
4. state smallest next action.

Do not mark blocked work complete.

### Root-cause escalation

If the same defect survives three repair attempts:

```text
STOP PATCHING
→ re-scout
→ reproduce minimally
→ challenge assumptions
→ inspect dependency/API contract
→ identify root cause
→ redesign smallest affected boundary
```

Three attempts is not a task limit; it is a trigger to change debugging strategy.

---

## 5. Phase 0 — Scout Audit

Before changing a substantial codebase, inspect it.

Produce a private/current-work map containing:

### Repository

- workspace/package structure;
- entrypoints;
- build scripts;
- dependency graph;
- generated files;
- environment configuration;
- test locations;
- database schema;
- migration state.

### Runtime path

Trace at least one end-to-end path relevant to the task.

Example:

```text
participant click
→ frontend handler
→ API client
→ Hono route
→ validation
→ service
→ database
→ RoomHub
→ SSE
→ room reducer
→ visualization
```

### Current architectural seams

Identify:

- canonical state;
- ephemeral state;
- duplicate responsibilities;
- cross-layer imports;
- large switches;
- hidden coupling;
- unsafe shared mutable state.

### UI/design

Inspect:

- layout hierarchy;
- typography;
- repeated cards;
- pills/badges;
- border-radius repetition;
- glass/gradient/glow usage;
- icon consistency;
- responsive behavior;
- motion patterns;
- loading/empty/error states.

### Performance

Look for:

- unbounded lists;
- animation state in React;
- render loops;
- expensive calculation in render;
- leaked timers/listeners;
- repeated database aggregate queries;
- too many DOM particles.

### Evidence

Do not “understand the codebase” from filenames alone. Read the relevant implementations.

---

## 6. Define the Goal Before Editing

Convert every task into measurable assertions.

Bad:

> Improve polling animation.

Good:

```text
GOAL A
When a vote changes aggregate percentage, the bar moves continuously
instead of jumping.

EVIDENCE
- existing aggregate integration test passes;
- visual state uses canonical aggregate;
- no per-frame React setState;
- reduced-motion mode jumps directly to final geometry;
- 200-event synthetic burst does not create >50 active DOM particles.

GOAL B
Host reveal has one primary choreography lasting <= 1.5 s before
the final result is fully readable.

EVIDENCE
- lock prevents responses;
- refresh while locked preserves state;
- reveal state persists;
- animation can be interrupted/reloaded without incorrect result.
```

A goal without evidence criteria is incomplete.

---

## 7. Implement Vertical Slices

Prefer a complete thin path over broad scaffolding.

Correct sequence for a new activity:

```text
shared contract
→ server validation
→ aggregate
→ tests
→ API use case
→ room event
→ participant input
→ canonical presentation
→ motion enhancement
→ analytics enhancement
```

Do not begin with particle effects before the underlying activity works.

---

## 8. Scout Before Adding Libraries

When introducing or using a substantial library:

1. query Context7/current official docs;
2. verify current import/API shape;
3. inspect package compatibility;
4. identify the exact problem it solves;
5. avoid duplicating an existing capability.

Priority research targets:

- Hono for HTTP/SSE/WebSocket APIs;
- Drizzle for database driver/migrations;
- Motion for React/SVG/layout animation;
- D3 for visualization math/layout;
- PixiJS for dense GPU-rendered stage effects;
- Bun for runtime/testing/workspaces.

Do not rely on remembered APIs when current documentation is available.

---

## 9. Architecture Enforcement

### 9.1 Canonical state

Database/application state is authoritative.

Animation objects are disposable.

### 9.2 Persist before canonical publish

No successful result broadcast before persistence.

### 9.3 Snapshot after reconnect

Every reconnect must be able to reconstruct truth without visual-event replay.

### 9.4 Bounded aggregation

Burst input must be coalesced.

### 9.5 Bounded visual queues

Particle/reaction queues must have hard limits or sampling.

### 9.6 Activity isolation

Adding a mode should mainly affect:

```text
activity definition
activity editor
participant renderer
presentation renderer
mode tests
```

If it requires editing unrelated modes, investigate abstraction leakage.

---

## 10. UI/UX Design Audit

After functional implementation, perform a separate design pass.

Do not combine “it works” with “it is good.”

### 10.1 Participant questions

- Is the current task obvious within 1 second?
- Is the primary action reachable by thumb?
- Is the submitted state unambiguous?
- Can the user change/cancel when policy allows?
- Does the page survive 320 px width?
- Is anything present that is irrelevant to answering?

### 10.2 Host questions

- Is current room/activity state visible?
- Can host start/lock/reveal without searching?
- Are dangerous actions differentiated?
- Are advanced controls progressively disclosed?
- Can host recover from an accidental action?
- Does the interface work under event pressure?

### 10.3 Presentation questions

- Can the back of a room read the result?
- Is the question still legible during movement?
- Is there one visual focal point?
- Does animation preserve continuity?
- Does any decorative motion compete with data?
- Does result composition survive projector aspect changes?

---

## 11. De-AI-Fy Audit

Perform this audit on every major UI surface.

Search visually and in code for common failure patterns.

### Reject

- generic glass panels;
- purple-blue gradients;
- neon glow;
- endless dark cards;
- repeated `rounded-xl border ...` everywhere;
- excessive pill/chip components;
- generic dashboard stat cards;
- emojis standing in for icons;
- default font stack as final identity;
- same easing on every motion;
- same hover translate on every component;
- decorative blobs;
- generic confetti;
- vague marketing copy;
- fake metrics.

### Questions

1. Could this screenshot be mistaken for an AI-generated SaaS template?
2. Are there too many interchangeable cards?
3. Is hierarchy created only with card borders?
4. Is there a product-specific visual primitive?
5. Does the stage have an identifiable composition?
6. Is typography doing real design work?
7. Would removing gradients/glows destroy the visual identity?
8. Does motion feel authored for the activity?

If the surface fails, redesign rather than add decoration.

---

## 12. Visual System Development

Do not start by creating 40 generic components.

Build two layers.

### Operational primitives

Accessibility-first:

- buttons;
- fields;
- sliders;
- dialogs;
- menus;
- toggles;
- icon controls.

### Roomwave expressive primitives

Build gradually from actual activities:

- `Lane`
- `VoteTrail`
- `CountRoll`
- `ResultSweep`
- `ScoreRail`
- `WordField`
- `SpectrumRail`
- `TruthMarker`
- `RevealMask`
- `RankTrack`
- `TensionLine`
- `CrowdField`
- `Stamp`
- `MomentumArrow`

A primitive is accepted only when at least one real product interaction needs it.

---

## 13. Motion Engineering Loop

For every meaningful animation:

### Step 1 — State transition

Write:

```text
FROM:
...

TO:
...
```

### Step 2 — Semantic purpose

Choose:

```text
arrival
claim
reflow
reveal
resolve
exit
```

### Step 3 — Renderer

Choose:

```text
DOM/Motion
SVG/Motion
PixiJS
CSS
```

### Step 4 — Interruption

Define what happens if:

- another response arrives;
- host changes state;
- tab loses visibility;
- user reloads;
- reduced motion is enabled.

### Step 5 — Performance bound

Define:

- max concurrent objects;
- max duration;
- whether events sample/coalesce;
- cleanup.

### Step 6 — Visual audit

Check:

- primary focus;
- readability during motion;
- no overlapping labels;
- no off-screen spill;
- no layout jump;
- no stale animation after reconnect.

### Step 7 — Reduced motion

Create a meaningful static/low-motion equivalent.

---

## 14. Motion Principles

### Do

- use layout continuity;
- animate transforms/opacity where practical;
- use springs for physical attachment/reflow where appropriate;
- use timing/easing for editorial wipes/reveals;
- use MotionValues for high-frequency interpolation when React rerenders are unnecessary;
- animate SVG attributes when data geometry itself changes;
- reserve Pixi for dense effects;
- stop Pixi ticker when idle;
- destroy resources on unmount.

### Do not

- use springs for every property;
- animate every hover;
- keep decorative loops running forever;
- trigger full component trees on every animation frame;
- create one DOM element per event at unbounded rates;
- make motion delay response acknowledgement.

---

## 15. D3 Usage Rule

D3 is not automatically the renderer.

Preferred pattern:

```text
data
→ D3 scale/bin/layout
→ geometry
→ React SVG
→ Motion transition
```

If direct D3 DOM manipulation is needed, isolate it behind a ref/effect boundary so React does not concurrently own the same nodes.

---

## 16. PixiJS Usage Rule

Use Pixi only when:

- object count/density justifies it;
- visual effect is non-semantic enhancement;
- DOM/SVG is measurably inadequate.

Requirements:

- initialize asynchronously before use;
- dedicated ticker unless shared behavior is intentional;
- cap objects;
- stop ticker when no animation is active;
- remove listeners;
- destroy app/resources on unmount;
- provide non-canvas semantic state.

---

## 17. Bug-Fix Loop

When a bug is found:

```text
1. reproduce
2. minimize
3. classify
4. locate violated invariant
5. write regression test where feasible
6. fix smallest root cause
7. rerun local test
8. rerun adjacent regression
9. inspect second-order effects
10. remove debug artifacts
```

### Bug classes

#### P0 — Integrity / security

Examples:

- wrong vote totals;
- unauthorized host command;
- cross-room data leak;
- response duplication.

Stop feature work until fixed.

#### P1 — Core flow broken

Examples:

- participant cannot join;
- SSE never reconnects;
- host cannot reveal.

Fix before merge.

#### P2 — Major UX/performance

Examples:

- mobile overflow;
- frame collapse under normal load;
- inaccessible interaction.

Fix before release.

#### P3 — Polish

Examples:

- minor easing issue;
- small typography mismatch.

Can be queued only if documented.

---

## 18. Root-Cause Audit

Never accept a patch that only hides a symptom when the invariant remains broken.

Ask:

- Why was invalid state possible?
- Why did tests not catch it?
- Is another path affected?
- Is the contract underspecified?
- Is state duplicated?
- Is one layer doing another layer's job?
- Did a dependency assumption change?

If an architectural rule would prevent recurrence, update the relevant document.

---

## 19. Self-Improvement Loop

The agent should improve the repository's engineering process as patterns emerge.

Maintain:

```text
docs/QUALITY-LOG.md
```

For significant recurring failures, record:

```md
## YYYY-MM-DD — Short title

### Failure
What repeatedly went wrong?

### Root cause
Why?

### New invariant/check
What rule or test prevents recurrence?

### Evidence
Which test/audit now verifies it?
```

Promote stable lessons into:

- `ARCHITECTURE-ESSENTIALS.md`;
- tests;
- lint rules;
- shared utilities;
- component contracts.

Do not accumulate vague “lessons learned.” Convert lessons into executable or reviewable safeguards.

---

## 20. Scout Audit After Each Phase

At the end of a feature phase, scan beyond the changed files.

Look for:

### Duplication

- duplicate schemas;
- duplicate calculations;
- duplicate event types;
- repeated motion values;
- copied UI structures.

### Dead code

- abandoned components;
- old experiment styles;
- unused endpoints;
- stale feature flags.

### Dependency creep

- unused packages;
- overlapping libraries;
- packages used for trivial helpers.

### Architectural erosion

- DB query inside presentation component;
- Hono type imported into shared domain;
- canvas object stored as canonical state;
- activity-specific logic in room core.

### Visual erosion

- new generic card patterns;
- accidental glassmorphism;
- inconsistent icons;
- font fallback;
- generic gradients;
- excessive corner rounding.

---

## 21. Performance Loop

For performance-sensitive work:

```text
baseline
→ instrument
→ reproduce
→ change
→ remeasure
→ compare
→ keep only measured improvement
```

Do not optimize from intuition alone.

### Measure

Backend:

- response latency;
- aggregate duration;
- update rate;
- DB query count.

Frontend:

- FPS;
- long tasks;
- React commit frequency;
- active animated object count;
- memory growth;
- canvas ticker activity.

---

## 22. Burst Testing

At minimum create synthetic scenarios.

### Poll burst

```text
100
500
1000
```

logical participants where practical.

Verify:

- final total exact;
- no duplicate logical votes;
- bounded aggregate broadcasts;
- no API crash;
- host snapshot exact after reconnect.

### Visual burst

Feed artificial visual events.

Verify:

- queue capped;
- events sampled/coalesced;
- canonical result unaffected;
- stage remains usable.

---

## 23. Design QA at Multiple Sizes

Check at least:

### Mobile

- 320×568
- ~390×844

### Host desktop

- 1280×720
- 1440×900

### Presentation

- 1280×720
- 1920×1080
- 16:10 equivalent

Also resize interactively; do not only test static screenshots.

---

## 24. Accessibility Audit

Before declaring a mode complete:

- keyboard complete;
- focus order logical;
- semantic labels;
- response confirmation announced appropriately;
- high contrast where required;
- no color-only selection;
- reduced motion;
- canvas/SVG has accessible summary;
- no rapid flashing.

Fix accessibility defects as product defects, not optional cleanup.

---

## 25. Activity Completion Template

A new activity is not complete until all boxes are true:

```text
[ ] shared type
[ ] config schema
[ ] response schema
[ ] server validation
[ ] state-machine integration
[ ] persistence
[ ] aggregate
[ ] aggregate unit tests
[ ] analytics
[ ] analytics unit tests
[ ] participant view
[ ] host editor
[ ] presentation view
[ ] realtime canonical update
[ ] visual event behavior
[ ] reconnect behavior
[ ] reduced-motion behavior
[ ] mobile QA
[ ] projector QA
[ ] load/burst sanity
[ ] anti-slop visual audit
```

---

## 26. Feature Development Order

Build in this order unless evidence supports another sequence.

### Phase 1 — Foundation

```text
workspace
shared contracts
Hono API
SQLite/Drizzle
room
join
host/participant token
health checks
```

### Phase 2 — Vertical Poll

```text
create poll
start
vote
change vote
aggregate
SSE snapshot/delta
animated result
```

### Phase 3 — Stage Control

```text
lock
hidden result
reveal
end
presentation mode
```

### Phase 4 — Reliability

```text
reconnect
rate limits
error states
integration tests
load script
```

### Phase 5 — Distinct Modes

```text
Spectrum
Prediction Battle
Word Bloom
Rank Race
```

One at a time through the full completion template.

### Phase 6 — Crowd Energy

```text
designed reaction set
visual event broker
Pixi reaction field
momentum
participation pulse
```

### Phase 7 — Portfolio Finish

```text
design refinement
motion refinement
accessibility
performance evidence
README
deployment
demo scenario
```

---

## 27. Code Review Questions

Before finishing a change:

### Architecture

- Did this introduce a second source of truth?
- Did an ephemeral concern leak into persistence?
- Did UI logic leak into server domain?
- Did activity-specific logic leak into room core?

### Correctness

- What happens on duplicate request?
- What happens after reload?
- What happens after reconnect?
- What happens if DB write fails?
- What happens if two events arrive quickly?

### UX

- Can a new participant understand it instantly?
- Is host state obvious?
- Is error recovery clear?

### Visual

- Is there unnecessary cardification?
- Is it visually generic?
- Does typography have hierarchy?
- Is motion semantically useful?

### Performance

- Is work bounded?
- Can this loop run forever?
- Does this allocate per frame?
- Is there cleanup?

---

## 28. Anti-Overengineering Rules

Do not:

- introduce CQRS/event sourcing for this MVP;
- persist every reaction particle;
- create a service per activity;
- use a global state library because “apps need one”;
- add Redis before multiple processes require shared ephemeral state;
- add PostgreSQL before SQLite creates a real constraint;
- add WebSocket before SSE/HTTP is insufficient;
- create a universal chart engine before two modes need the same abstraction;
- create a theme-builder before one coherent visual identity exists.

---

## 29. Refactoring Rule

Refactor when at least one is true:

- two or more real implementations duplicate non-trivial logic;
- a boundary is repeatedly violated;
- a feature cannot be tested independently;
- a performance hotspot requires isolation;
- an abstraction is clearly hiding rather than reducing complexity.

Do not refactor solely to create more folders.

---

## 30. Definition of Done

A substantial task is complete only when:

```text
FUNCTION
✓ happy path works
✓ invalid path works
✓ persistence is correct
✓ realtime state is correct after reconnect

QUALITY
✓ unit/integration tests pass
✓ typecheck passes
✓ build passes
✓ no P0/P1 defect

UX
✓ participant flow understandable
✓ host controls clear
✓ errors recoverable
✓ accessibility checked

VISUAL
✓ anti-AI-slop audit passed
✓ motion has semantic purpose
✓ layout survives target sizes
✓ reduced-motion path valid

PERFORMANCE
✓ loops/queues bounded
✓ resources cleaned
✓ relevant burst test passes

DOCUMENTATION
✓ architectural deviations recorded
✓ measured claims only
```

---

## 31. Final Release Audit

Before calling Roomwave portfolio-ready, run a complete audit from scratch.

### A. New-user test

Without developer explanation:

```text
create
→ scan
→ join
→ answer
→ see live result
```

### B. Reliability test

- restart/reload;
- reconnect;
- change answer;
- lock;
- reveal;
- invalid token;
- invalid room;
- ended activity.

### C. Crowd test

Run synthetic burst.

### D. Visual test

Compare every main surface against the anti-slop list.

### E. Motion test

Record presentation at 60 fps if possible and inspect:

- jank;
- overlaps;
- unreadable intermediate states;
- late stale animations;
- overlong choreography.

### F. Accessibility test

Keyboard + reduced motion + semantic labels.

### G. Repository test

- unused dependencies;
- secrets;
- stale experiments;
- debug logs;
- generated junk;
- uncommitted DB;
- inconsistent scripts.

Repeat repair cycles until gates pass.

---

## 32. Agent Mantra

> **Scout before assumptions.  
> Define evidence before implementation.  
> Build the smallest complete vertical slice.  
> Separate truth from effects.  
> Measure before optimizing.  
> Audit after “working.”  
> Repair root causes.  
> De-AI-fy deliberately.  
> Stop only when the gates pass.**
