# ARCHITECTURE.md — Roomwave System Design

> **Purpose:** Define the implementation architecture for Roomwave, a realtime audience interaction and visualization system.  
> **Architectural style:** Modular monolith + shared contracts + realtime room hub + pluggable activity definitions.  
> **Primary rule:** Keep canonical data, ephemeral realtime events, and visual animation state separate.

---

## 1. Architecture Goals

The architecture must optimize for:

1. **Fast vertical development** — one repository, few runtime services.
2. **Realtime correctness** — reconnecting clients can restore truth from a snapshot.
3. **Extensible activities** — adding a new mode should not require rewriting the room system.
4. **High-quality visualization** — rendering strategy selected by density and interaction need.
5. **Burst tolerance** — hundreds of near-simultaneous votes should not cause hundreds of expensive full recomputations.
6. **Simple deployment** — initial release can run as one application service plus one SQL database.
7. **Clear future scaling path** — SQLite → PostgreSQL and in-memory RoomHub → Redis-backed pub/sub without changing product contracts.
8. **Testable analytics** — consensus, median, histogram, momentum, and other derived metrics live in deterministic modules.
9. **No animation-as-truth** — effects can drop frames without corrupting data.

---

## 2. Top-Level System

```text
                                ROOMWAVE

                    ┌──────────────────────────┐
                    │       Browser App        │
                    │                          │
                    │ Host / Participant /     │
                    │ Presentation             │
                    └────────────┬─────────────┘
                                 │
                         HTTP + SSE
                                 │
                    ┌────────────▼─────────────┐
                    │       Bun + Hono         │
                    │                          │
                    │ Routes                   │
                    │ Application Services     │
                    │ Activity Registry        │
                    │ Aggregation Scheduler    │
                    │ RoomHub                  │
                    └───────┬──────────┬───────┘
                            │          │
                     Drizzle│          │ events
                            ▼          ▼
                       ┌────────┐  ┌─────────────┐
                       │ SQLite │  │ Live Room   │
                       │  MVP   │  │ Memory      │
                       └────────┘  └─────────────┘
```

Production scaling can evolve to:

```text
                         Load Balancer
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
          Bun API #1                      Bun API #2
               │                               │
               └───────────────┬───────────────┘
                               ▼
                         Redis / PubSub
                               │
                               ▼
                           PostgreSQL
```

Do not implement this distributed topology until needed.

---

## 3. Repository Layout

Recommended Bun workspace:

```text
roomwave/
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   ├── application/
│   │   │   ├── domain/
│   │   │   ├── activities/
│   │   │   ├── analytics/
│   │   │   ├── realtime/
│   │   │   ├── db/
│   │   │   ├── middleware/
│   │   │   ├── security/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   ├── pages/
│       │   ├── features/
│       │   ├── activities/
│       │   ├── visualization/
│       │   ├── motion/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── styles/
│       └── package.json
│
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── contracts/
│   │       ├── schemas/
│   │       ├── events/
│   │       └── types/
│   │
│   └── math/
│       └── src/
│           ├── distributions.ts
│           ├── entropy.ts
│           ├── ranking.ts
│           └── statistics.ts
│
├── tests/
│   ├── integration/
│   ├── load/
│   └── fixtures/
│
├── docs/
│   ├── decisions/
│   ├── QUALITY-LOG.md
│   └── PERFORMANCE.md
│
├── PRD.md
├── ARCHITECTURE.md
├── ARCHITECTURE-ESSENTIALS.md
├── AGENT.md
├── package.json
└── bun.lock
```

`packages/math` may remain inside the API initially if extracting it provides no benefit. The boundary matters more than the folder count.

---

## 4. Layer Responsibilities

### 4.1 Routes

Routes translate HTTP into application commands.

Routes may:

- parse path/query/header data;
- validate external input;
- call an application service;
- map domain errors to HTTP responses.

Routes should not:

- implement aggregation math;
- mutate RoomHub internals;
- construct chart geometry;
- contain SQL-heavy business rules.

### 4.2 Application Services

Coordinate use cases:

- create room;
- join room;
- create activity;
- start;
- lock;
- reveal;
- submit response;
- moderate submission;
- end room.

Application services can use:

- repositories/Drizzle queries;
- activity registry;
- authorization;
- aggregate scheduler;
- room event publisher.

### 4.3 Domain / Activity Definitions

Contains product rules independent of transport.

Examples:

- whether an activity accepts responses;
- whether answer changes are allowed;
- valid option membership;
- response schema;
- aggregate calculation;
- reveal semantics.

### 4.4 Analytics

Pure or deterministic calculations.

Examples:

- mean;
- median;
- quantiles;
- histogram bins;
- normalized entropy;
- consensus;
- movement;
- momentum window comparison;
- closest prediction;
- rank scores.

No UI imports. No Hono. Prefer no database imports.

### 4.5 Realtime

Responsible for:

- subscriber registry;
- publishing RoomEvent;
- coalescing ephemeral updates;
- heartbeat;
- connection lifecycle;
- snapshot delivery.

### 4.6 Visualization

Frontend-only data-to-geometry layer.

It selects:

- DOM;
- SVG;
- Canvas/Pixi.

### 4.7 Motion

Frontend-only choreography primitives and recipes.

Motion does not own canonical business state.

---

## 5. Domain Model

Core model:

```text
Room
 ├── ParticipantSession*
 └── Activity*
       └── Response*
```

### Room

```ts
type RoomStatus = "lobby" | "live" | "ended"

interface Room {
  id: string
  code: string
  title: string
  status: RoomStatus
  activeActivityId: string | null
  createdAt: string
  expiresAt: string
}
```

### Activity

```ts
type ActivityState =
  | "draft"
  | "live"
  | "locked"
  | "revealed"
  | "ended"

interface Activity<TConfig> {
  id: string
  roomId: string
  type: ActivityType
  prompt: string
  state: ActivityState
  config: TConfig
  createdAt: string
}
```

### Response

```ts
interface ActivityResponse<TPayload> {
  id: string
  activityId: string
  participantId: string
  payload: TPayload
  createdAt: string
  updatedAt: string
}
```

---

## 6. Activity Plugin Model

Avoid a large switch statement distributed across the system.

Conceptual server interface:

```ts
interface ActivityDefinition<
  TConfig,
  TResponse,
  TAggregate,
  TAnalytics = unknown
> {
  type: ActivityType

  configSchema: ZodSchema<TConfig>
  responseSchema: ZodSchema<TResponse>

  validateResponse(input: {
    config: TConfig
    response: TResponse
  }): void

  aggregate(input: {
    config: TConfig
    responses: TResponse[]
  }): TAggregate

  analytics?(input: {
    config: TConfig
    responses: TResponse[]
    aggregate: TAggregate
  }): TAnalytics
}
```

Registry:

```ts
activityRegistry.register(multipleChoiceDefinition)
activityRegistry.register(spectrumDefinition)
activityRegistry.register(predictionDefinition)
activityRegistry.register(wordBloomDefinition)
activityRegistry.register(rankRaceDefinition)
activityRegistry.register(hotTakeDefinition)
activityRegistry.register(quadrantDropDefinition)
activityRegistry.register(questionBoardDefinition)
activityRegistry.register(beforeAfterDefinition)
activityRegistry.register(signalNoiseDefinition)
activityRegistry.register(realityBenderDefinition)
activityRegistry.register(livingConsensusDefinition)
activityRegistry.register(futureForkDefinition)
activityRegistry.register(cipherRoomDefinition)
activityRegistry.register(shadowCouncilDefinition)
```

The shipped modes intentionally cover reusable response engines:
choice, bounded text, scalar position, numeric prediction, ordering, signed
position, two-axis position, append-plus-vote, repeated impulse, and paired
before/after position. The signature set adds sealed binary confidence,
paired perception, confidence-weighted position, staged revision, sealed numeric
choice, and fixed-budget allocation. New concepts should compose these engines
before adding a new storage or realtime primitive.

Frontend mirrors the conceptual registry:

```ts
interface ActivityRendererDefinition {
  type: ActivityType
  Participant: ComponentType<...>
  HostEditor: ComponentType<...>
  Presentation: ComponentType<...>
}
```

Do not try to share React components with the server package.

---

## 7. Activity State Machine

The activity lifecycle is explicit:

```text
          create
            │
            ▼
          DRAFT
            │ start
            ▼
           LIVE
          /    \
      lock      end
       │         │
       ▼         ▼
     LOCKED     ENDED
       │
    reveal
       │
       ▼
    REVEALED
       │
      end
       │
       ▼
     ENDED
```

Rules:

- `draft`: editable, no responses.
- `live`: accepts responses.
- `locked`: no new response; result may remain hidden.
- `revealed`: result/answer is public; response policy is mode-specific but should normally remain closed.
- `ended`: terminal.

State transitions are validated server-side.

---

## 8. Persistence Model

MVP tables:

```text
rooms
activities
participants
responses
moderation_items   (only when public text ships)
```

Recommended constraints:

```text
rooms.code UNIQUE

responses(activity_id) INDEX
responses(activity_id, updated_at) INDEX
```

Single-response modes implement one logical answer slot per participant with a
synchronous select/update-or-insert command. Append-only modes such as Word
Bloom and Crowd Meter retain individual submissions. A database-wide unique
constraint on `(activity_id, participant_id)` is therefore invalid because it
prevents the second word or tap. If multi-process writers are introduced later,
add an explicit response-slot/discriminator column and conditional uniqueness
before replication.

### JSON columns

Activity config and response payload can initially use typed JSON text fields because activity payload shapes vary.

Avoid premature table-per-mode schemas.

If later analytics demand heavy SQL over particular fields, add derived/indexed columns intentionally.

---

## 9. Durable vs Ephemeral State

### Durable — database

Store:

- room;
- activity configuration;
- activity state;
- participant session identity;
- response;
- moderated question;
- actual answer for prediction;
- result data needed after process restart.

### Ephemeral — RoomHub / memory

Keep:

- active SSE subscribers;
- recent response velocity windows;
- reaction particles;
- transient celebration events;
- connection heartbeat state;
- debounce timers;
- event coalescing queues;
- presentation animation IDs.

Rule:

> If losing the API process would make the room mathematically incorrect, the state does not belong only in memory.

---

## 10. Realtime Model

MVP transport:

```text
Client command     → HTTP POST/PATCH
Server update      → SSE
```

This is deliberate.

Use HTTP for:

- join;
- create activity;
- start/lock/reveal;
- answer;
- react;
- moderate.

Use SSE for:

- room snapshot;
- activity state;
- aggregate updates;
- participant count approximation;
- reaction effects;
- room messages.
- bounded presence lease updates.

Presence uses an authenticated heartbeat command over HTTP and an ephemeral
45-second server lease. This keeps the existing reconnect-safe SSE topology
while distinguishing "joined" from "online now." If later game mechanics need
continuous bidirectional input, that measured path can move to Bun's native
WebSocket pub/sub without changing durable room or activity contracts.

Timed games persist `deadlineAt` on the activity. A per-process scheduler gives
prompt visual locking, while state reads and response writes lazily enforce an
expired deadline after a process restart. The final response guard compares the
deadline again so a late network request cannot cross the round boundary.

### Why SSE first

Most realtime traffic is server → client after explicit HTTP commands. SSE gives:

- simple browser reconnection;
- ordinary HTTP infrastructure;
- named events;
- event IDs;
- no bidirectional connection protocol required.

### When to consider WebSockets

Only after measuring a use case requiring:

- very high-rate bidirectional control;
- game-style continuous input;
- host remote-control channels;
- low-overhead repeated participant events;
- presence semantics better served by one persistent socket.

Do not migrate just because WebSockets sound more “realtime.”

---

## 11. RoomHub

Conceptual API:

```ts
interface RoomHub {
  subscribe(
    roomId: string,
    listener: RoomListener
  ): Unsubscribe

  publish(
    roomId: string,
    event: RoomEvent
  ): void

  publishEphemeral(
    roomId: string,
    event: EphemeralRoomEvent
  ): void
}
```

Internal structure:

```text
Map<roomId, LiveRoom>

LiveRoom
 ├── subscribers
 ├── aggregateTimers
 ├── momentumWindows
 ├── reactionLimiterState
 └── ephemeralQueues
```

The rest of the application should depend on a RoomHub interface, not directly on `Map`.

That allows a future Redis-backed implementation.

---

## 12. Snapshot + Delta

Correctness model:

```text
CONNECT / RECONNECT
        │
        ▼
  room.snapshot
        │
        ▼
canonical room state
        │
        ▼
subsequent delta events
```

Snapshot contains enough data to render the current state correctly:

```ts
interface RoomSnapshot {
  room: PublicRoom
  activity: PublicActivity | null
  aggregate: Aggregate | null
  participantCount?: number
}
```

Deltas can include:

```ts
type RoomEvent =
  | { type: "activity.started"; ... }
  | { type: "activity.locked"; ... }
  | { type: "activity.revealed"; ... }
  | { type: "aggregate.updated"; ... }
  | { type: "response.arrived"; ... }
  | { type: "reaction.created"; ... }
  | { type: "participant.count"; ... }
```

`response.arrived` may be a visual hint. `aggregate.updated` is canonical result data.

---

## 13. Separate Canonical Events from Visual Events

### Canonical

Needed for truth:

```text
room.snapshot
activity.started
activity.locked
activity.revealed
aggregate.updated
```

### Ephemeral visual

May be dropped/sampled:

```text
response.arrived
reaction.created
celebration.burst
momentum.tick
```

If the browser misses an ephemeral event, it may miss an animation but must still arrive at the correct aggregate.

The client that issues a durable host command also performs an authoritative
snapshot read after the command succeeds. SSE remains the propagation path for
every other client, but the initiating host must not depend on receiving its own
in-process event to become consistent.

---

## 14. Aggregation Pipeline

Naive:

```text
vote
→ write
→ full aggregate query
→ broadcast

vote
→ write
→ full aggregate query
→ broadcast
```

This becomes wasteful under bursts.

Use a scheduler:

```text
many votes
   │
   ├─ write
   ├─ write
   ├─ write
   └─ write
       │
       ▼
mark activity dirty
       │
       ▼
50–100 ms coalescing window
       │
       ▼
aggregate once
       │
       ▼
broadcast canonical aggregate
```

Properties:

- response writes remain durable;
- aggregation rate is bounded;
- client receives frequent enough updates for fluid animation;
- repeated dirties during the window do not create extra timers.

Never debounce participant acknowledgement. Debounce/coalesce expensive shared aggregation/broadcast work.

---

## 15. Analytics Pipeline

For each aggregate update:

```text
responses/config
      │
      ▼
aggregate()
      │
      ├── canonical counts/distribution
      │
      ▼
analytics()
      │
      ├── consensus
      ├── spread
      ├── median
      ├── velocity
      └── mode-specific metrics
```

Separate:

- canonical result;
- derived interpretation.

If analytics code fails, the result itself should still be renderable.

---

## 16. Frontend State Architecture

No global state library is required initially.

Use:

### Server/canonical state

A room store/hook owns:

```text
room
current activity
aggregate
connection state
```

### Ephemeral visual state

Separate animation/effects subsystem owns:

```text
vote particles
reaction sprites
temporary highlights
reveal timeline
```

### Local UI state

React component state:

```text
editor form
dialog open
selected option
draft question
```

Do not place every animation frame into React state.

---

## 17. Suggested Frontend Modules

```text
src/
├── app/
│   ├── router.tsx
│   └── providers.tsx
│
├── features/
│   ├── rooms/
│   ├── host/
│   ├── participant/
│   └── presentation/
│
├── activities/
│   ├── registry.ts
│   ├── choice/
│   ├── word-bloom/
│   ├── spectrum/
│   ├── prediction/
│   ├── ranking/
│   └── quadrant/
│
├── visualization/
│   ├── svg/
│   ├── canvas/
│   ├── scales/
│   └── geometry/
│
├── motion/
│   ├── choreography/
│   ├── primitives/
│   ├── reduced-motion.ts
│   └── budgets.ts
│
├── realtime/
│   ├── room-stream.ts
│   ├── room-reducer.ts
│   └── event-router.ts
│
└── ui/
    ├── controls/
    ├── typography/
    └── icons/
```

---

## 18. Rendering Architecture

### 18.1 DOM + Motion

Use for semantically interactive controls and low-count visuals.

Examples:

- buttons;
- option lanes;
- 4–10 result rows;
- moving score numbers;
- host studio.

Use Motion's layout animation when geometry reflows.

Use MotionValue-like primitives for high-frequency values that do not need React component reconciliation on each interpolation step.

### 18.2 SVG + D3 calculation

D3 is used as a mathematical/visualization utility:

- `scaleLinear`;
- `scaleBand`;
- `extent`;
- `bin`;
- line/area generators;
- force simulation when suitable.

Preferred ownership:

```text
D3 → computes geometry
React → declares SVG
Motion → animates SVG
```

Avoid letting D3 and React both fight over the same DOM nodes.

### 18.3 PixiJS

Use only for dense stage effects.

Examples:

- 200+ reaction sprites;
- transient crowd bursts;
- bounded particle celebration;
- GPU-accelerated background response field.

Lifecycle:

```text
mount
→ await app.init()
→ attach dedicated ticker
→ render bounded objects
→ stop ticker when idle
→ destroy resources on unmount
```

Prefer renderer auto-detection and a WebGPU/WebGL-capable path where appropriate.

Do not render forms, text-heavy host UI, or accessibility-critical controls in Pixi.

---

## 19. Motion Architecture

Create reusable **motion primitives**, not a global one-size transition.

### Primitive examples

```text
ArrivalTrail
ClaimPulse
CountRoll
ResultSweep
RankShift
DistributionLand
RevealCurtain
TruthMarker
WinnerLock
StampIn
FieldRipple
ExitCollapse
```

Each primitive defines:

- semantic purpose;
- allowed renderer;
- duration range;
- easing/spring class;
- reduced-motion behavior;
- interruption behavior;
- maximum concurrent instances.

### Choreography recipes

Activities compose primitives:

```text
Prediction reveal:
LockInput
→ Hold
→ RevealCurtain
→ TruthMarker
→ DistributionReact
→ ClosestGuessLock
→ SummaryNumbers
```

Do not build a central “magic animation component” with 40 props.

---

## 20. Visual Event Broker

High-rate ephemeral effects need their own bounded queue.

Concept:

```ts
interface VisualEventBroker {
  push(event: VisualEvent): void
  subscribe(listener: VisualListener): Unsubscribe
}
```

Responsibilities:

- sample repeated events;
- group bursts;
- cap queue length;
- merge identical reaction bursts;
- prevent old events from animating after reconnect;
- respect reduced motion.

Example:

100 votes in 100 ms should not necessarily create 100 DOM particles.

Possible policy:

```text
0–20 events/s  → individual particles
20–100 events/s → sampled particles + stronger aggregate pulse
100+ events/s → batch waves + canonical result motion
```

This preserves the perception of crowd energy without destroying frame rate.

---

## 21. Word Bloom Layout

A naive full cloud recomputation makes every word jump.

Desired behavior:

1. retain stable word IDs;
2. preserve positions for existing terms where possible;
3. grow font/shape according to new weight;
4. place only new terms;
5. resolve collisions in bounded iterations;
6. periodically compact if layout quality degrades.

Possible implementations:

- d3-cloud with stabilization layer;
- custom force/collision layout;
- cached placement + local collision correction.

No unbounded synchronous layout loops on the main thread.

For very large rooms, consider moving layout work to a Web Worker after measurement.

---

## 22. Prediction Distribution

Server aggregate:

```ts
interface PredictionAggregate {
  total: number
  min: number | null
  max: number | null
  mean: number | null
  median: number | null
  bins: Array<{
    x0: number
    x1: number
    count: number
  }>
}
```

Reveal analytics:

```ts
interface PredictionRevealAnalytics {
  actual: number
  medianAbsoluteError: number
  closestDistance: number
  belowActual: number
  aboveActual: number
}
```

Public responses should not reveal participant identity.

---

## 23. Consensus

Keep math in a tested shared module.

```ts
export function normalizedEntropy(
  counts: readonly number[]
): number
```

Rules:

- handle zero responses;
- handle one-option edge case;
- avoid NaN;
- document logarithm base irrelevance after normalization;
- clamp numerical drift to [0, 1].

UI may label:

- “Strong consensus”
- “Mixed room”
- “Split room”

only if thresholds are explicitly defined and tested.

---

## 24. API Shape

Representative routes:

```text
POST   /api/rooms
POST   /api/rooms/:code/join
GET    /api/rooms/:roomId/state
GET    /api/rooms/:roomId/events

POST   /api/rooms/:roomId/activities
PATCH  /api/activities/:activityId

POST   /api/activities/:activityId/start
POST   /api/activities/:activityId/lock
POST   /api/activities/:activityId/reveal
POST   /api/activities/:activityId/end

POST   /api/activities/:activityId/responses
GET    /api/activities/:activityId/results

POST   /api/rooms/:roomId/reactions
```

Use a consistent error envelope:

```ts
interface ApiError {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
```

Do not return stack traces to clients.

---

## 25. Authentication / Authorization

MVP does not require user accounts.

### Host

Room creation returns a cryptographically random host secret.

Store:

```text
hostTokenHash
```

Client stores token locally.

Host-only commands verify:

- room exists;
- token matches;
- transition permitted.

### Participant

Join returns:

- participant ID;
- random participant token.

Store token hash.

Response submission verifies:

- participant exists;
- belongs to room;
- activity belongs to same room;
- activity accepts responses;
- payload matches mode.

Do not use participant identifiers as authentication secrets.

---

## 26. Rate Limiting

At minimum:

```text
room creation → IP-based
join          → IP + room
response      → participant
reaction      → participant
public text   → participant
```

Reaction and crowd-meter endpoints require stricter burst controls than ordinary polls.

Rate-limit responses should be explicit and recoverable.

---

## 27. Moderation

For public text modes:

Pipeline:

```text
submission
→ schema validation
→ length/control-character validation
→ deterministic moderation rules
→ pending/accepted/rejected
→ aggregate/display
```

Host can:

- approve/reject if moderation mode enabled;
- remove after publication;
- disable public text.

Do not make an LLM dependency required for safety or normal operation.

---

## 28. Failure Handling

### Database write fails

- participant sees failure;
- do not publish success event;
- retry only where idempotency is safe.

### Aggregate calculation fails

- log structured error;
- keep last known aggregate;
- do not corrupt canonical response rows;
- retry/recompute.

### SSE disconnects

- browser reconnects;
- server sends fresh snapshot;
- discard stale visual queue.

### Pixi/canvas fails

- semantic/canonical visualization remains available where possible;
- high-density effects are enhancement, not correctness.

### QR unavailable

- room code remains visible.

---

## 29. Observability

Structured logs should include:

```text
requestId
roomId (where safe)
activityId
route
event type
duration
status
error code
```

Metrics worth measuring locally:

- response write latency;
- aggregation duration;
- SSE broadcast duration;
- active room count;
- subscriber count;
- aggregate updates/sec;
- dropped/sampled visual events;
- client FPS in benchmark mode;
- particle count.

Do not build a full observability platform for MVP.

---

## 30. Performance Testing

Create synthetic load scripts.

Scenarios:

### A — steady poll

- 100 participants;
- one vote each over 20 s.

### B — burst reveal

- 500 participants;
- most respond in a 2 s burst.

### C — reaction swarm

- 100 participants;
- repeated bounded reactions.

### D — reconnect

- host presentation disconnects during voting;
- reconnect;
- verify aggregate matches API state.

Record evidence in `docs/PERFORMANCE.md`.

---

## 31. Testing Pyramid

### Pure unit tests

High priority:

- activity validators;
- state transitions;
- aggregate math;
- entropy;
- median;
- histogram;
- prediction error;
- ranking algorithms;
- normalization.

### Integration tests

Use actual DB:

```text
create room
→ join
→ create activity
→ start
→ respond
→ change response
→ aggregate
→ lock
→ reveal
```

### Realtime integration

Verify:

- snapshot;
- delta;
- reconnect;
- ordering assumptions;
- no broadcast before failed persistence.

### Browser E2E

Critical flows:

- join by code;
- vote;
- host sees update;
- reveal;
- mobile viewport;
- reduced motion.

### Visual regression

Capture key presentation states rather than every animated frame.

---

## 32. Design Architecture

Do not build a conventional “design system” consisting only of:

```text
Button
Card
Badge
Input
Modal
```

Roomwave needs two layers.

### Utility UI layer

Accessible operational components:

- Button;
- TextInput;
- Slider;
- Dialog;
- Toggle;
- Menu;
- Tooltip;
- icon button.

### Expressive stage primitive layer

Product-specific primitives:

- Lane;
- Track;
- Marker;
- Stamp;
- Counter;
- Distribution;
- Cluster;
- Meter;
- TensionLine;
- RevealMask;
- ScoreRail;
- PosterFrame;
- CrowdField;
- MomentumArrow.

The stage primitives create identity.

---

## 33. Typography

Use deliberate font roles.

Example model:

```text
Display:
variable condensed / grotesk / poster face

Body:
high-legibility sans

Numeric:
tabular numerals or mono/technical face where useful
```

Do not use five unrelated fonts.

Do not let typography collapse to browser defaults in presentation mode.

Typography is part of motion:

- counter rolls;
- width changes;
- variable font axis movement;
- mask reveals;
- tracking expansion;
- line-break choreography.

---

## 34. Responsive Strategy

### Participant

320 px and up.

Primary interaction should not require horizontal scrolling.

### Host

Desktop/laptop priority but usable on tablet.

### Presentation

Responsive to:

- 16:9 projector;
- 16:10 projector;
- ultrawide display;
- browser window resizing.

Never assume fixed viewport dimensions.

Use container measurements for visualizations.

---

## 35. Accessibility Architecture

Every activity definition should document:

- keyboard model;
- screen-reader label strategy;
- non-color encoding;
- reduced-motion fallback;
- focus behavior after state transitions.

Dense Pixi visualizations need an accessible semantic summary outside canvas.

---

## 36. Deployment

MVP:

```text
Internet
   │
   ▼
Reverse proxy / platform ingress
   │
   ▼
Bun + Hono
   ├── serves API
   ├── SSE
   └── optionally serves built React assets
   │
   ▼
SQLite persistent volume
```

For a simple hosted portfolio:

- one container;
- persistent SQLite volume;
- regular backups.

Supported release layouts are:

- one VPS serving the built client, API, SSE, and persistent SQLite;
- Vercel or Cloudflare Pages for the static client with the API on a VPS.

Vercel-only is not a supported stateful deployment. The API depends on a
persistent SQLite volume, timers, presence leases, and process-owned SSE state.
A Cloudflare-native port requires a room-scoped SQLite Durable Object, alarms,
and a Workers-compatible realtime adapter. See `docs/DEPLOYMENT.md` for the
exact environment and proxy contract.

Scale only when needed:

```text
SQLite → PostgreSQL
RoomHub → Redis-backed RoomHub
single API → multiple replicas
```

---

## 37. Architectural Decision Rules

Before introducing a dependency or subsystem, answer:

1. What measured problem exists?
2. Why can't the current layer solve it?
3. What is the smallest solution?
4. What new failure modes appear?
5. How will it be tested?
6. Can it be removed later?

Reject “industry standard” as a sufficient reason.

---

## 38. Context7-Informed Library Notes

Current documentation research supports the following architectural split:

### Motion

Useful capabilities include:

- layout animation;
- `AnimatePresence`;
- SVG path animation;
- springs;
- MotionValue-driven updates that can avoid React re-rendering on every interpolated value.

Use these for semantic and moderate-density UI motion.

### D3

D3's own React guidance supports using non-DOM modules such as scales and arrays directly in React, while DOM-manipulating modules require careful integration.

Preferred Roomwave rule:

> D3 computes; React declares; Motion animates.

### PixiJS

PixiJS 8 supports GPU-accelerated WebGL/WebGPU rendering, application tickers, responsive resizing, and explicit resource cleanup.

Use:

- dedicated ticker;
- stop when idle;
- destroy on unmount;
- bounded particle counts.

Do not make PixiJS the product shell.

---

## 39. Definition of Architectural Success

The architecture is working when:

- a new activity can be added without editing unrelated room logic;
- reconnecting reconstructs correct state from one snapshot;
- 500 burst votes do not create 500 expensive full-stage recomputations;
- high-density visual effects can be disabled without changing result correctness;
- unit tests can execute analytics without starting a server;
- frontend can render canonical state without replaying animation history;
- replacing RoomHub transport does not change domain contracts;
- replacing SQLite with PostgreSQL does not change client contracts.
