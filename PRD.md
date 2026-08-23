# PRD.md — Roomwave

> **Status:** Product definition  
> **Product:** Roomwave  
> **Category:** Live audience participation, polling, visualization, and event interaction  
> **Primary environments:** Colleges, classrooms, clubs, conferences, hackathons, public events, workshops, festivals, community gatherings  
> **Product thesis:** A live audience should not feel like rows being added to a database. Every response should feel like the room visibly changed.

---

## 1. Product Summary

Roomwave is a real-time audience interaction system in which a host creates a temporary room and participants join instantly through a QR code or short code. The host launches interactive activities—polls, predictions, spectrums, rankings, word fields, question boards, and other formats—and the room's responses become animated, legible, playful visualizations in real time.

Roomwave is **not** intended to be “Slido with fewer features.” Its differentiator is the **experience of participation**:

- answers visibly arrive;
- results have momentum rather than merely refreshing;
- the projector becomes a responsive stage;
- a crowd can see agreement, disagreement, surprise, polarization, convergence, and change;
- each activity has a distinct motion language instead of sharing one generic chart template.

The system should feel suitable for a university lecture at 11:00, a hackathon stage at 18:00, and a public youth event at 20:00 without changing its core architecture.

---

## 2. Product Problem

Conventional audience polling tools solve data collection well but often reduce the audience experience to:

1. scan a QR code;
2. tap an answer;
3. watch a conventional bar chart resize.

That is adequate utility but weak interaction design.

Roomwave addresses three problems:

### 2.1 Participation feels transactional

Submitting an answer frequently produces little perceptible feedback beyond “submitted.” The participant cannot feel their contribution entering the room.

### 2.2 Results are visually static

Most tools use generic dashboards, chart components, white cards, pill controls, uniform rounded rectangles, and minimally animated bars. The projector experience is therefore informational rather than performative.

### 2.3 Feature-heavy tools create friction

Public events and classrooms need fast entry. Accounts, onboarding, workspace selection, role setup, templates, and configuration panels delay the first useful interaction.

Roomwave should instead optimize for:

> **scan → understand → act → see consequence**

---

## 3. Product Goals

### G1 — Join in seconds

A participant should be able to scan a QR code and reach the current activity without creating an account.

**Target:** median time from QR scan to usable activity under 8 seconds on ordinary mobile internet.

### G2 — Make each response perceptible

A submitted answer must produce immediate local feedback and, when appropriate, a bounded visual consequence on the shared display.

### G3 — Make results legible at room scale

A person standing at the back of a lecture hall should understand:

- the question;
- the dominant result;
- the shape of disagreement;
- whether the room is still changing.

### G4 — Create memorable interaction modes

At least four modes must feel meaningfully different in mechanics and visualization, not merely different input controls connected to the same bar chart.

### G5 — Preserve correctness under animation

Animation must never be the source of truth. Canonical aggregate values come from server-side state. Visual effects interpret canonical state and disposable realtime events.

### G6 — Keep the product lightweight

The first production-quality portfolio release should remain a small deployable system:

- one web frontend;
- one Bun/Hono API;
- one SQL database;
- one realtime room hub;
- no microservices unless measured scaling requirements demand them.

### G7 — Be visually distinctive without becoming noisy

The design can be bright, funky, maximalist, kinetic, irregular, typographic, and playful while preserving hierarchy and task clarity.

> Maximalism is permitted. Visual confusion is not.

---

## 4. Non-Goals

The first portfolio release does **not** attempt to become:

- an enterprise employee engagement suite;
- an LMS;
- a survey research platform;
- a webinar platform;
- an AI chatbot;
- an AI-generated presentation product;
- an identity or SSO platform;
- a full event ticketing system;
- a long-term audience CRM;
- a remote video conferencing system.

Avoid “AI because portfolio.” If semantic grouping or moderation is ever added later, it must solve a measured problem and remain optional.

---

## 5. Target Users

### 5.1 College lecturer

Needs:

- instant anonymous polls;
- comprehension checks;
- prediction questions;
- confidence spectrums;
- “before vs after” comparisons;
- simple participation without student accounts.

### 5.2 College club / hackathon organizer

Needs:

- crowd icebreakers;
- live voting;
- favorite-project selection;
- audience awards;
- prediction games;
- stage-friendly visuals.

### 5.3 Public event host

Needs:

- large-room readability;
- live reactions;
- moderation;
- easy room entry;
- host control over reveal timing;
- projector-safe presentation.

### 5.4 Workshop facilitator

Needs:

- prioritization;
- ranking;
- sentiment spectrums;
- open questions;
- group convergence visualizations.

### 5.5 Participant

Needs:

- zero setup;
- one-thumb interactions;
- confidence that the answer registered;
- freedom from accidental oversharing;
- clear current activity;
- no dashboard clutter.

---

## 6. Core Experience Principles

### 6.1 The room is the primary object

Users should think:

> “I joined this room.”

Not:

> “I opened a dashboard containing a poll entity.”

### 6.2 One dominant action at a time

Apply Hick's Law intentionally. Participant screens should expose the decision required **now**, not every capability of the room.

### 6.3 Recognition over recall

The participant should not remember navigation states, mode names, or codes after entry. The current activity explains itself.

### 6.4 Fitts's Law for mobile participation

Primary answer controls must be large, separated, thumb-friendly, and usable without precision tapping.

### 6.5 Immediate feedback

The participant interface should acknowledge a response immediately while the server confirms it. Failure must be visible and recoverable.

### 6.6 Progressive disclosure for hosts

The host should initially see only:

- question/mode;
- essential options;
- launch control.

Advanced timing, reveal, moderation, and visualization controls appear contextually rather than as a permanent control wall.

### 6.7 Gestalt hierarchy

Use grouping, proximity, continuation, and contrast so maximalist visual styling does not destroy semantic grouping.

### 6.8 Peak–end design

Reveal moments, winner moments, and room-summary moments receive the richest choreography because they disproportionately affect memorability.

### 6.9 Motion communicates state change

Motion must answer at least one question:

- what arrived?
- where did it go?
- what changed?
- what won?
- what is related?
- what ended?
- what should receive attention next?

Decorative perpetual animation is not a product goal.

---

## 7. Anti-AI-Slop Visual Direction

The UI must not look like a generic AI-generated SaaS dashboard.

### Explicitly avoid

- glassmorphism as a default surface language;
- translucent frosted cards everywhere;
- glowing purple/blue gradients;
- neon cyberpunk treatment;
- generic “AI dark dashboard” layouts;
- dozens of same-sized rounded cards;
- uniform 12–16 px radius on every object;
- excessive pills/chips/badges;
- emojis used as substitutes for product icons;
- huge generic hero copy with floating decorative blobs;
- Inter-only/default-system-font visual identity;
- every state represented by a colored dot and pill;
- symmetrical grids when asymmetry would improve energy;
- generic confetti for every success;
- identical hover-lift effects on every interactive object;
- gradients merely because a surface feels empty;
- visual noise that carries no data or interaction meaning.

### Allowed

Internal CSS variables and semantic implementation constants are allowed. The prohibition is against a **visible “design token / pill UI aesthetic”**, not sound engineering.

### Desired visual character

Roomwave should explore:

- editorial typography;
- expressive condensed display type;
- oversized numerals;
- controlled type distortion or variable-font axes;
- bold flat color fields;
- poster-like composition;
- irregular but intentional geometry;
- hard edges mixed with selective soft forms;
- halftone, offset-print, stamp, paper, marker, ticket, score-board, sports-broadcast, classroom-board, festival-poster influences;
- animated underlines, wipes, slashes, cutouts, frames, counters, tracks, rails, sweeps, stamps, shutters, and masks;
- visual hierarchy created through scale, rhythm, density, and motion—not just cards.

Maximalism is a **composition strategy**, not permission to fill every pixel.

---

## 8. Product Surfaces

### 8.1 Home

Two dominant paths:

- **Host a room**
- **Join a room**

No account requirement in MVP.

### 8.2 Host Studio

Host controls:

- room identity;
- current activity;
- create activity;
- activity queue;
- start;
- lock;
- reveal only for blind-result and sealed-truth modes;
- end;
- presentation preview;
- moderation where required.

This is an operational interface, not the stage itself.

### 8.3 Presentation Stage

A dedicated projector-first view.

Priorities:

1. question;
2. response visualization;
3. state/reveal;
4. room code/QR when useful;
5. response count and selected analytics.

Minimal operational chrome.

### 8.4 Participant Surface

Mobile-first.

Priorities:

1. current prompt;
2. input/choice;
3. response confirmation;
4. lightweight room state;
5. optional reactions if enabled.

---

## 9. Activity Modes

The activity system must be extensible. Each mode defines:

- config schema;
- response schema;
- server aggregation;
- result model;
- participant renderer;
- host editor;
- presentation renderer;
- motion recipe;
- analytics recipe.

### 9.1 Pulse Choice

Classic multiple choice, but responses visibly “claim” options.

Possible visual forms:

- elastic bars;
- lanes;
- stacks;
- weighted tiles;
- race tracks;
- orbit clusters.

Key mechanics:

- one or multiple selection;
- allow/disallow changing answer;
- hidden result mode;
- reveal.
- optional **Minority Wins** social rule: the least-popular non-empty option is
  crowned only after a mandatory blind reveal.

### 9.2 Word Bloom

Participants submit short words/phrases.

The cloud should behave like a living field rather than re-running a chaotic layout on every response.

Behaviors:

- repeated terms grow;
- new terms enter from the perimeter;
- highly active terms pulse briefly;
- stable terms retain spatial identity;
- rejected/moderated terms disappear with a clear but non-dramatic exit.

Possible layouts:

- word field;
- cluster islands;
- typographic wall;
- radial bloom.

### 9.3 Spectrum

Participants place themselves on a continuous range.

Examples:

- “Strongly disagree → strongly agree”
- “Not confident → very confident”
- “Conservative estimate → aggressive estimate”

Visualization:

- dots land on a rail;
- distribution thickens;
- median marker moves;
- consensus/polarization appears;
- optional before/after overlays.

### 9.4 Prediction Battle

Participants estimate a numerical value before the real answer is revealed.

Example:

> What percentage of students in this room used an AI coding assistant this week?

Stage:

1. guesses arrive;
2. distribution forms;
3. host locks;
4. actual answer enters dramatically;
5. nearest guesses are highlighted;
6. room error and median are shown.

This should be a flagship portfolio interaction.

### 9.5 Rank Race

Participants reorder options.

Results can visualize:

- average rank;
- first-place share;
- pairwise preference;
- rank movement.

Presentation should resemble a race/ladder rather than a static table.

### 9.6 Hot Take Duel

Two opposing propositions.

Participant swipes/taps toward one side with optional confidence intensity.

Visualization:

- tension line;
- weighted pull;
- center-of-room indicator;
- momentum arrows;
- polarization.

### 9.7 Quadrant Drop

Participants place a point on a 2D plane.

Examples:

- effort vs impact;
- familiar vs useful;
- risk vs reward.

Analytics:

- centroid;
- density regions;
- quadrant shares;
- outliers.

### 9.8 Q&A / Question Board

Participants submit questions.

Features:

- vote up;
- host mark answered;
- moderation;
- live ordering.

Avoid copying generic social-feed cards. Explore queue/board/stage-ticket representations.

### 9.9 Crowd Meter

One-tap repeated input for applause-like intensity.

Examples:

- “How excited are we?”
- choose winner during demos;
- live cheering proxy.

Must be rate-limited. Show rolling intensity rather than raw cumulative spam.

### 9.10 Before / After

Run the same question twice.

Visualize opinion movement:

- start distribution;
- end distribution;
- net movement;
- changed minds;
- convergence/divergence.

This is particularly useful for classrooms.

### 9.11 Signal / Noise

A timed confidence game built for classrooms, clubs, and live fact-checking.

Host authors:

- one statement;
- the sealed Signal or Noise answer;
- a short reveal note;
- a 5 to 120 second room clock.

Participants choose a side and state 50 to 100 percent confidence. Results stay
sealed until reveal. The stage then shows room accuracy, average confidence,
calibration gap, forecast error, and the share of high-confidence misses.

The deadline and truth are server-owned. Reloading, reconnecting, or changing a
device clock cannot extend the answer window or expose the answer early.

### 9.12 Reality Bender

Participants mark both what they expected the room to say and what they
personally believe. The reveal overlays the two distributions and reports the
signed perception gap, misread share, and projection correlation. The result
must show whether the crowd accurately read itself, not label disagreement as
error.

### 9.13 Living Consensus

Participants place a position and confidence. The stage behaves like a bounded
data organism whose location, width, pulse, and tension come from canonical
mean, consensus, confidence, and polarization values. Reduced motion presents
the same final geometry without a perpetual pulse.

### 9.14 Future Fork

Participants choose and rate a likely future, then see host-authored evidence
and revise. The reveal shows branch flows, changed-mind share, branch likelihood
before and after, and confidence movement. Before and after answers belong to
one participant response so the path is anonymous but analytically valid.

### 9.15 Cipher Room

A timed Caesar-shift challenge with a host-sealed answer from 0 to 25.
Participants choose a shift and confidence. The stage wheel reveals the correct
shift only after lock and reports accuracy, confidence, consensus, and the most
common read. The mode teaches pattern recognition; it is not cryptographic
security.

### 9.16 Shadow Council

The first production slice is an anonymous tribunal round. The host provides
three to six fictional aliases, evidence, a sealed shadow identity, and a room
clock. Every participant must allocate exactly three suspicion marks, choose one
tribunal target, and state confidence. The reveal reports suspicion heat,
banishment votes, identification accuracy, confidence, and tribunal consensus.

Long-form role assignment, private chat, elimination rounds, and matchmaking
remain separate future systems. They must not be implied by this round.

### 9.17 Room rules and identity

Rooms use a small authored set of controls rather than a free-form theme
builder: four projector-tested palettes, lobby copy, capacity, late-join rules,
reactions, visible presence, live answer-count visibility, generated or chosen
room names, and opt-in sound character.

Participant identity is room-scoped. A durable bearer session restores the same
answer slot, name, and procedural pixel character. Online presence is temporary
and no device fingerprint is collected.

---

## 10. Reactions Without Emoji-as-Icon Slop

Roomwave may support expressive reactions, but the product should use a **designed reaction set**, not OS emoji as UI icons.

Possible system:

- custom monochrome/duotone symbols;
- hand-drawn stamps;
- abstract burst shapes;
- iconographic reaction marks;
- event-specific sticker packs.

Reaction types may semantically map to:

- agree;
- surprise;
- laugh;
- question;
- energy.

On the presentation surface, reactions should be rendered as bounded particles/stamps and should not obscure important data.

---

## 11. Fun Analytics

Analytics should expose properties of the crowd, not merely totals.

### 11.1 Consensus

For categorical polls, use normalized Shannon entropy.

\[
H=-\sum_i p_i \ln(p_i)
\]

\[
H_n = \frac{H}{\ln(k)}
\]

\[
Consensus = 1-H_n
\]

Display as a secondary interpretation, not a fake scientific truth.

### 11.2 Polarization

Detect bimodality / split support where appropriate.

Do not label a distribution “polarized” using a simplistic threshold without documenting the calculation.

### 11.3 Momentum

Compare recent response windows.

Example:

- last 5 s vs previous 5 s;
- option gaining fastest;
- change in room median.

Momentum is ephemeral and should not be persisted as canonical data unless required for replay.

### 11.4 Convergence

For repeated or time-based activities:

- is the spread decreasing?
- is the room moving toward one answer?

### 11.5 Surprise

When a prediction's actual answer is revealed:

- median absolute error;
- closest answer;
- share above/below truth.

### 11.6 Participation Pulse

Responses per second over a bounded recent window.

Useful for stage energy; not a vanity graph permanently occupying the interface.

### 11.7 Changed Minds

When answer changes are allowed:

- number/percentage who changed;
- largest directional movement.

Preserve privacy; do not expose identifiable individual trajectories.

---

## 12. Motion Language

Motion is a first-class product system.

### 12.1 Motion categories

#### Arrival
New information enters.

Examples:

- vote particle enters a lane;
- word stamps into field;
- spectrum point lands.

#### Claim
A contribution attaches to an option/result.

Examples:

- particle merges into bar;
- tile gains weight;
- cluster expands.

#### Reflow
Existing data changes geometry.

Use smooth layout transition rather than destructive re-render.

#### Reveal
Hidden truth becomes visible.

Use staged choreography:

1. freeze;
2. create anticipation;
3. reveal source/answer;
4. transform results;
5. emphasize takeaway.

#### Resolve
Winner or conclusion becomes clear.

Secondary elements recede; primary result gains spatial dominance.

#### Reset
Activity ends and stage prepares for the next one.

Avoid generic fade-to-black for every transition.

### 12.2 Motion constraints

- motion must preserve information continuity;
- high-frequency data should not trigger expensive React re-renders unnecessarily;
- numeric counters may use MotionValue-style direct animation;
- layout animation should be used when geometry changes;
- SVG paths and shapes can animate when they carry data meaning;
- dense particles should move to a GPU/canvas renderer;
- reduced-motion mode remains fully usable;
- motion must have an end state;
- no perpetual decorative float loops on primary UI;
- no “everything springs” rule.

### 12.3 Choreography hierarchy

At any moment:

- at most one **primary** high-salience motion;
- a small number of secondary motions may reinforce it;
- ambient activity must not compete with current comprehension.

---

## 13. Rendering Strategy

Use three rendering tiers.

### Tier A — Semantic DOM + Motion

For:

- forms;
- buttons;
- text;
- host controls;
- result bars;
- counters;
- small sets of interactive objects.

### Tier B — SVG + D3 math + Motion

For:

- histograms;
- distributions;
- spectrum plots;
- quadrant maps;
- ranking lines;
- vector diagrams;
- relationship graphics.

D3 should primarily provide:

- scales;
- bins;
- extents;
- layouts;
- path/shape calculations.

React should own DOM/SVG structure whenever practical.

### Tier C — PixiJS

For:

- reaction swarms;
- high-density particles;
- bounded celebration fields;
- visually rich dense stage effects.

PixiJS is not the application UI renderer.

---

## 14. Library Direction

Use exact versions from current package registries when implementation begins; do not freeze versions in this PRD.

### Core

- Bun
- TypeScript
- React
- Vite
- Hono
- SQLite initially
- Drizzle ORM
- Zod
- Motion
- D3
- QRCode library
- Lucide or a coherent custom icon set

### Optional specialized rendering

- PixiJS for high-density stage graphics
- d3-cloud or a custom stable word layout for Word Bloom

### Do not add by default

- Redux;
- GraphQL;
- Kafka;
- Redis;
- PostgreSQL;
- Next.js;
- microservice orchestration.

Adopt only after a measured requirement justifies them.

---

## 15. Realtime Experience Requirements

### Participant submission

Expected flow:

```text
tap
 ↓
local pressed/submitting feedback
 ↓
HTTP request
 ↓
server validates + persists
 ↓
server publishes event
 ↓
aggregate recomputed/coalesced
 ↓
SSE broadcast
 ↓
stage updates
```

### Reconnect

Clients must recover using:

```text
connect/reconnect
 ↓
authoritative room snapshot
 ↓
subsequent deltas
```

The client must not require replay of every historical visual event to become correct.

---

## 16. Accessibility

Maximalist design does not excuse poor accessibility.

Requirements:

- keyboard access for host workflows;
- visible focus treatment;
- sufficient text/background contrast;
- no color-only meaning;
- semantic labels;
- accessible input controls;
- reduced-motion mode;
- minimum practical touch target ~44 px;
- screen-reader status for submission success/failure;
- projector views remain legible at distance;
- avoid flashing patterns that create safety risks.

---

## 17. Privacy and Abuse

### MVP privacy

- participants may remain anonymous;
- avoid device fingerprinting;
- avoid exposing participant-level answer histories publicly;
- use random participant tokens;
- store only data needed for room function.

### Abuse prevention

- request size limits;
- room creation rate limit;
- participant response rate limit;
- reaction rate limit;
- host moderation for public text;
- profanity filtering may be an optional deterministic layer;
- room expiration;
- event-specific host controls.

---

## 18. Performance Budgets

Initial product targets:

### API

- ordinary response submission p95 under 200 ms on local/LAN development hardware excluding internet transport;
- aggregation updates coalesced under bursts;
- no per-vote full-room unbounded computation.

### Realtime

- result update target perceptually immediate;
- aggregate broadcast rate bounded, e.g. 10–20 updates/s for bursty modes;
- ephemeral effects may be sampled/coalesced.

### Frontend

- target 60 fps for normal presentation animation;
- no unbounded DOM particle creation;
- avoid rerendering the entire stage on every high-frequency tick;
- cap concurrent particles/effects;
- clean up animation/ticker resources.

These are targets to measure, not claims to place in the README before benchmarking.

---

## 19. MVP

The first releasable portfolio MVP contains:

### Rooms

- create room;
- short join code;
- QR entry;
- anonymous participant session;
- room expiration.

### Pulse Choice

- create;
- start;
- vote;
- change vote;
- lock;
- hidden results;
- reveal;
- animated result state.

### Spectrum

- submit;
- distribution;
- median;
- simple consensus/spread.

### Prediction Battle

- guess;
- live distribution;
- lock;
- reveal actual;
- closest guess;
- room error.

### Word Bloom

- submit short terms;
- normalize;
- aggregate;
- stable live layout.

### Presentation

- projector mode;
- room code/QR when relevant;
- realtime state;
- reveal choreography.

### Reliability

- reconnect;
- snapshot;
- validation;
- rate limits;
- tests for aggregate math.

---

## 20. Post-MVP

Possible:

- Rank Race;
- Quadrant Drop;
- Before/After;
- Q&A;
- designed reaction swarm;
- custom event themes;
- host remote-control mode;
- downloadable result summary;
- room replay using aggregate checkpoints;
- PostgreSQL;
- Redis pub/sub for multiple API instances.

---

## 21. Success Criteria

The project is considered product-quality only when:

1. a new participant can join without explanation;
2. the host can run a poll without refreshing;
3. reconnecting does not corrupt visible results;
4. answer changes do not create duplicate logical votes;
5. stage motion remains smooth under a realistic burst;
6. at least four activity modes have genuinely different visual behavior;
7. the product does not resemble a generic card-based AI dashboard;
8. presentation mode is readable from a projected screen;
9. reduced-motion mode works;
10. analytics calculations have tests;
11. failures are surfaced clearly;
12. a load-test script produces real evidence;
13. the README uses measured claims only.

---

## 22. Experience Test

Before accepting a major interaction, ask:

> If the colors, logo, and copy disappeared, would the motion and interaction still feel recognizably Roomwave?

If the answer is no, the feature is probably relying on surface styling rather than interaction design.

---

## 23. Product Mantra

> **Live, legible, kinetic, social, and controlled.**

A participant should feel:

> “My action entered the room.”

A host should feel:

> “I can control the room without operating a complicated dashboard.”

An audience should feel:

> “The result is happening, not merely being displayed.”
