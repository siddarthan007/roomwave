# ARCHITECTURE-ESSENTIALS.md — Roomwave Non-Negotiables

> This file is the short engineering contract.  
> If implementation disagrees with this file, either fix the implementation or explicitly amend the architecture decision. Do not silently drift.

---

## 1. Product Invariant

Roomwave is a **live audience experience**, not a generic admin dashboard with realtime charts.

Every important design decision must preserve:

```text
FAST ENTRY
+ CLEAR ACTION
+ VISIBLE CONSEQUENCE
+ LEGIBLE RESULT
+ CONTROLLED ENERGY
```

---

## 2. System Shape

MVP:

```text
React/Vite
   │
HTTP + SSE
   │
Bun/Hono
   ├── Activity engine
   ├── Aggregation
   ├── Analytics
   ├── RoomHub
   └── Drizzle
        │
        ▼
      SQLite
```

Do not introduce microservices, Kafka, Redis, GraphQL, or a second backend unless measurements require them.

---

## 3. Source-of-Truth Rules

### Database

Canonical durable truth:

- rooms;
- activities;
- activity state;
- participants;
- responses;
- moderation state.

### RoomHub

Ephemeral:

- subscribers;
- temporary presence;
- reaction bursts;
- velocity windows;
- debounce/coalescing timers;
- transient visual events.

### Frontend

Presentation state:

- canonical room snapshot;
- canonical aggregate;
- local form state;
- disposable animation state.

> Animation state is never canonical business state.

### Database startup

The configured SQLite file is migrated before application queries, compatibility
repairs, or index maintenance can reference its tables. A new volume replays all
checked-in migrations. A migration-tracked database applies only pending work.
A complete pre-tracking Roomwave schema may be repaired to the documented legacy
baseline and marked there without losing data. A partial core schema fails closed
and requires restore from a valid backup.

Rooms with no durable create, join, round, or response for 24 hours are
hard-deleted on a coalesced sweep. In-memory presence, reactions, listeners,
deadlines, and event sequences for those rooms are dropped, and SQLite runs a
PASSIVE WAL checkpoint after a successful purge.

---

## 4. Realtime Rule

Use:

```text
commands → HTTP
updates  → SSE
```

until a measured requirement proves WebSockets necessary.

Every reconnect begins with a fresh authoritative snapshot.

Do not depend on complete event replay for correctness.

---

## 5. Persist Before Publish

Correct order:

```text
validate
→ authorize
→ persist
→ publish visual hint
→ schedule aggregate
→ publish canonical aggregate
```

Never broadcast successful canonical state before durable persistence succeeds.

---

## 6. Aggregation Rule

Do not recompute and broadcast the full result independently for every vote under burst load.

Use a dirty-activity scheduler with a bounded coalescing interval.

Participant acknowledgement remains immediate.

---

## 7. Activity Contract

Every mode must define:

```text
config schema
response schema
validation
aggregation
analytics
participant renderer
host editor
presentation renderer
motion recipe
accessibility behavior
```

If a new mode requires special cases throughout unrelated layers, the abstraction is failing.

The shipped contracts span reusable response families: choice, bounded
text, scalar position, prediction, ordering, signed position, two-axis
position, append-plus-vote, repeated impulse, paired before/after position, and
sealed binary confidence. The signature contracts add paired perception,
confidence-weighted position, staged revision, sealed numeric choice, and exact
fixed-budget allocation. Signal / Noise, Cipher Room, and Shadow Council use a
server-owned deadline and reveal-gated truth.
Prefer composing one of these families over introducing a new transport path.

Every colored action surface has a paired semantic foreground. A theme may
invert or brighten any palette color, so component code must not assume that
white is readable on every saturated background.

### Timed activity invariant

A timer is a server rule, not a browser decoration. The stored ISO deadline is
published with server time, responses recheck it at the final synchronous write
boundary, and an expired live round atomically becomes locked. Browser clocks
only render the remaining time.

### Presence invariant

Durable participant rows count joins. Online presence is a renewable in-memory
lease and may disappear without changing room history. A reconnect, response,
or authenticated heartbeat renews the lease. Device fingerprinting is not an
identity mechanism.

---

## 8. Activity State Machine

The base lifecycle is:

```text
draft
  ↓
live
  ↓
locked
  ├─ live-result mode ───────────────→ ended
  └─ blind-result or sealed-truth mode → revealed → ended
```

Reveal is a contract capability, not a universal ceremony. A locked live-result
round already has its final result and rejects a redundant reveal command.
Blind-result rounds and sealed-truth games require a persisted reveal before
their public result is final. The shared activity policy is used by the API,
host, participant, and stage so those surfaces cannot invent different rules.
Some modes may end early, but invalid transitions must fail server-side.

`reopen` returns a locked round to `live`; timed modes receive a new server
deadline. `reset` is a host-only command, not another lifecycle state. It deletes the
current round's responses and returns an active round to `live`. `end` is
terminal for the activity and clears `rooms.active_activity_id`, so reconnecting
clients return to the lobby instead of rendering stale results.

### Blind-result invariant

Blind mode is enforced by the public state boundary, not by hiding elements in
the browser. Before reveal, public snapshots and aggregate events contain the
exact response count and rolling momentum but no distribution. Prediction truth
is removed from public activity config until the persisted `revealed` state.

After a successful durable host command, the host reads the canonical snapshot.
Do not make the command issuer rely on receiving its own SSE event. Other
clients continue to converge through SSE and reconnect snapshots.

---

## 9. Rendering Rule

Choose renderer by density and semantics.

### DOM + Motion

Use for:

- controls;
- text;
- small sets;
- bars;
- cards only where a card is semantically justified.

### SVG + D3 math + Motion

Use for:

- histograms;
- distributions;
- ranking;
- spectrums;
- quadrant plots;
- path-based data graphics.

### PixiJS

Use for:

- dense particles;
- reaction swarms;
- bounded stage effects.

Do not render accessibility-critical interaction solely in canvas.

---

## 10. D3 / React Boundary

Preferred:

```text
D3 computes geometry
React owns SVG/DOM
Motion owns transition
```

Avoid mixed DOM ownership.

---

## 11. Motion Rule

Motion must communicate:

- arrival;
- attachment;
- change;
- hierarchy;
- reveal;
- resolution.

Do not animate merely because an element exists.

No universal spring.

No perpetual floating UI.

No 1,000 DOM particles.

No animation should block the next required host action.

---

## 12. Motion Budget

At one time:

- one primary high-salience choreography;
- limited secondary reinforcement;
- ambient motion must stay subordinate.

Target 60 fps on ordinary modern laptops/phones for normal views.

Use sampling/batching under event bursts.

Respect `prefers-reduced-motion`.

---

## 13. Visual Event Sampling

Ephemeral effects are lossy by design.

Under burst load:

```text
few events     → individual motion
medium burst   → sample + aggregate pulse
large burst    → wave/batch representation
```

Canonical aggregate remains exact.

---

## 14. Anti-Slop Visual Rules

Reject by default:

- glassmorphism;
- blue-purple glow;
- neon cyberpunk;
- generic gradient hero;
- identical rounded cards;
- pill/badge saturation;
- emoji-as-icon;
- default-font-only identity;
- same border radius everywhere;
- decorative blobs;
- generic confetti;
- excessive shadows;
- “AI dashboard” visual grammar.

Do not solve an empty layout by adding another card.

---

## 15. Desired Visual Grammar

Prefer:

- bold flat color;
- editorial composition;
- large numeric typography;
- expressive display type;
- poster/scoreboard/stage influences;
- hard masks;
- cutouts;
- tracks;
- rails;
- stamps;
- wipes;
- intentional asymmetry;
- data-driven geometry;
- motion-led hierarchy.

Bright and maximalist is acceptable. Unstructured noise is not.

---

## 16. UX Principles

### Hick's Law

Participant sees only the choices necessary now.

### Fitts's Law

Primary mobile targets roughly 44 px or larger.

### Recognition over recall

No hidden command vocabulary or remembered mode semantics.

### Progressive disclosure

Advanced host controls appear when relevant.

### Gestalt grouping

Maximalist layouts still need obvious semantic groups.

### Immediate feedback

Every participant input shows submitted/pending/error state.

### Error recovery

A failure offers a clear next action; never silently drop an answer.

---

## 17. Presentation Rules

Presentation mode is not the host dashboard enlarged.

Projector view prioritizes:

1. prompt;
2. visualization;
3. current phase;
4. meaningful result/analytic;
5. room access only when needed.

Operational controls should be hidden or remote.

---

## 18. Participant Rules

Participant mode:

- mobile-first;
- one-thumb usable;
- no account;
- no dashboard navigation;
- current activity dominates;
- clear response confirmation;
- no unnecessary analytics.

---

## 19. Analytics Rules

Every displayed metric must have:

- documented calculation;
- edge-case handling;
- unit tests;
- honest labeling.

Never invent pseudo-scientific “engagement scores.”

Use metrics such as:

- normalized entropy/consensus;
- median;
- distribution;
- prediction error;
- rank score;
- participation velocity.

---

## 20. Privacy Rules

Do not:

- fingerprint devices;
- expose participant identity with answers;
- publish raw token values;
- log secrets.

Store hashes for host/participant bearer secrets.

Collect minimal data.

---

## 21. Security Validation

Server validates:

```text
room exists
participant belongs to room
activity belongs to room
activity accepts responses
response schema matches mode
selected option exists
number is within bounds
text length/control characters valid
host transition authorized
```

Frontend validation is UX, not security.

---

## 22. Performance Rules

Avoid:

- full-room rerender on animation tick;
- full aggregate query per visual frame;
- unbounded arrays of historical effects;
- synchronous heavy cloud layout on every word;
- idle canvas tickers;
- leaked EventSource/Pixi listeners.

Measure before claiming performance.

---

## 23. Accessibility Rules

Required:

- keyboard host operation;
- semantic controls;
- visible focus;
- non-color-only encoding;
- reduced motion;
- accessible canvas summaries;
- no hazardous flashing;
- projector-readable typography.

Accessibility is not postponed to “polish.”

---

## 24. Testing Minimum

Before a feature is done:

### Unit

- validation;
- aggregate;
- analytics;
- state transitions.

### Integration

- create/join/start/respond/lock/reveal.

### Realtime

- snapshot;
- delta;
- reconnect.

### UI

- mobile interaction;
- projector layout;
- reduced motion.

---

## 25. Evidence Rule

No README performance claim without recorded evidence.

For meaningful changes record, where relevant:

```text
tests run
build result
lint/typecheck
load scenario
screenshots
FPS trace
known limitations
```

---

## 26. Dependency Rule

Before adding a dependency:

1. inspect current documentation;
2. state the problem;
3. compare with existing stack;
4. check bundle/runtime cost;
5. define removal path;
6. add only if it materially improves the result.

Use Context7/current official docs rather than relying on remembered APIs.

---

## 27. “Done” Rule

A task is not done because code was written.

It is done only when:

```text
goal defined
→ implementation complete
→ test passes
→ failure paths checked
→ visual/UX audit passes
→ regression check passes
→ no known P0/P1 defect remains
```

---

## 28. Scaling Rule

Do not pre-build distributed infrastructure.

Upgrade path:

```text
SQLite     → PostgreSQL
RoomHub    → Redis-backed pub/sub
1 API      → replicated APIs
```

Only when measurement or deployment requirements justify it.

---

## 29. Quality Gate

Before merging, ask:

### Correctness
- Is canonical state correct after reconnect?
- Are duplicates prevented?
- Are transitions valid?

### Realtime
- Does burst input remain stable?
- Are updates coalesced?
- Are stale effects discarded?

### Design
- Does this look like another generic AI dashboard?
- Is there a real composition, not just cards?
- Is the stage visually distinct?

### Motion
- Does motion explain a change?
- Is it smooth?
- Is it bounded?
- Is reduced motion valid?

### UX
- Can a first-time participant use it without instruction?
- Can the host recover from mistakes?

### Performance
- Are render loops bounded?
- Are resources cleaned up?

If a material answer is “no,” the change is not ready.
