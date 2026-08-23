# Quality log

## 2026-08-23 - Late-join policy briefly shared the expiry branch

### Failure

A late join that raced with a host rule change could enter the same branch as
room expiry and close the room.

### Root cause

Two distinct rejection reasons were combined around a helper that intentionally
persists expiry.

### New invariant/check

Expiry may end a room. A late-join rule only rejects that join. The final
post-hash room read now handles them in separate branches.

### Evidence

The lifecycle suite covers closed late joining, participant capacity, and a
room that remains available for its active players.

## 2026-08-23 - Theme-aware control contrast

### Failure

The dark-theme host screen rendered yellow and ink-colored controls with light
text, reproducing the unreadable end-round control seen in mobile QA.

### Root cause

Foreground selection assumed `--ink` was always dark even though curated room
themes may invert paper and ink.

### New invariant/check

Every named surface has an explicit `--on-*` foreground. Components request the
paired foreground instead of assuming that saturated colors use white. The
Midnight palette uses dark foregrounds on its bright action colors, while the
light palettes retain independently checked pairings.

### Evidence

Phone-width host QA shows readable controls in the Midnight palette, and the
frontend build and lint pass.

## 2026-08-23 - Signature modes were concepts without full contracts

### Failure

Five authored mode concepts had no shared payloads, validation, aggregation,
participant flow, host editor, stage result, reveal redaction, or lifecycle test.

### Root cause

The idea documents described spectacles but did not establish a mode contract
or a safe release boundary for the social-deduction concept.

### New invariant/check

Reality Bender, Living Consensus, Future Fork, Cipher Room, and the Shadow
Council tribunal round now implement every activity layer. Sealed Cipher and
Shadow truth is removed from public snapshots until persisted reveal. Timed
rounds use the existing server deadline boundary.

### Evidence

A route integration test runs create, start, redaction, response, lock, reveal,
and end for all five contracts. Mode tests verify each aggregate. Live mobile
and projector QA covered Reality Bender and Shadow Council, including a rapid
three-mark suspicion budget and timer auto-lock.

## 2026-08-23 - Projector chrome crowded short displays

### Failure

At 1280 by 720, the stage header consumed enough vertical space to push the
primary reveal analytics below the initial viewport.

### Root cause

The projector layout responded to width but not to short landscape height.

### New invariant/check

Short landscape displays use compact stage chrome, smaller arrival type, a
bounded question measure, and reduced vertical result spacing without changing
phone or tall-projector layouts.

### Evidence

The 1280 by 720 header measured 94.7 pixels after the change, down from 220.7,
and the primary result moved from 448.5 to 322.5 pixels from the viewport top.

## 2026-08-23 - Timed game truth and deadline boundary

### Failure

The scaffold had no durable place for a server deadline or sealed game truth.

### Root cause

Activity lifecycle covered manual state transitions only.

### New invariant/check

Signal / Noise stores its deadline and answer, redacts answer and explanation
until reveal, auto-locks at the deadline, and rejects a response that arrives
after the deadline. Calibration metrics are computed from durable responses.

### Evidence

Integration tests force a deadline into the past and confirm the late response
is rejected, the activity locks, and only reveal publishes the truth.

## 2026-08-23 — Persisted responses aggregated as zero

### Failure

All mode tests stored valid responses but the aggregate reader returned zero.

### Root cause

The query returned `{ payload, updatedAt }` rows while three aggregators treated
each entire row as the response payload.

### New invariant/check

Every mode maps database rows to `row.payload` before narrowing by activity
type. Aggregate tests cover choice, spectrum, prediction, word, and meter data.

### Evidence

The focused aggregate suite and full suite pass.

## 2026-08-23 — Append-only modes blocked by a global unique index

### Failure

A participant's second Word Bloom phrase or Crowd Meter tap violated
`UNIQUE(activity_id, participant_id)`.

### Root cause

One response-table constraint tried to represent both answer-slot and event-log
semantics.

### New invariant/check

Single-answer modes update one application-owned slot; append modes insert an
event. Tests submit two words and two taps from one participant.

### Evidence

Append-mode tests pass, and the schema now indexes activity/time without the
invalid global uniqueness rule.

## 2026-08-23 — Blind and prediction secrets crossed the public boundary

### Failure

The browser could receive a Prediction Battle answer in activity config and
could fetch blind aggregates even when the UI did not render them.

### Root cause

The snapshot service returned the database activity and aggregate directly.

### New invariant/check

Public room state redacts prediction truth and returns `aggregate: null` for a
blind round until persisted reveal. Counts and momentum remain public.

### Evidence

Room-state and lifecycle integration tests verify pre-reveal redaction and
post-reveal restoration.

## 2026-08-23 — Workspace React duplication blanked the dev app

### Failure

The Vite page rendered blank and reported an invalid hook call after workspace
dependencies were relinked.

### Root cause

The dev resolver loaded two React module identities from the Bun workspace.

### New invariant/check

Vite explicitly deduplicates `react` and `react-dom`. Browser verification now
includes a real dev-server render, not only a production build.

### Evidence

The host, participant, and stage routes render from the running Vite server.

## 2026-08-23 — Host commands could wait on their own stale SSE hub

### Failure

An activity was durably created and started, but the initiating host stayed on
the launch form after a hot API reload left an existing SSE client on an older
in-memory hub.

### Root cause

The host UI treated its own lifecycle event as the only state confirmation,
and Bun hot-module replacement could leave open streams subscribed to an older
module instance of the in-memory room hub.

### New invariant/check

Every successful host mutation immediately fetches and installs the canonical
room snapshot. The API development command uses process-restarting watch mode
so open streams reconnect to the new singleton hub after source edits. SSE
remains responsible for propagating state to other clients.

### Evidence

Live host, participant, and stage views converged after launch and submission;
the lifecycle integration suite covers durable state transitions.

## 2026-08-23 - Vite could run without a reachable API

### Failure

The web server repeatedly logged `ECONNREFUSED` for room state and event
requests when only Vite was running. Windows localhost resolution could also
send the proxy to an address where the API was not listening.

### Root cause

Local development required two independent commands and the proxy used an
ambiguous localhost target. EventSource then retried a backend that was not
there without a bounded application retry policy.

### New invariant/check

The root development command starts every workspace service together and stops
the group if one service exits. Vite proxies to `127.0.0.1` by default. Room
streams start only after the canonical room snapshot exists, close on errors,
and reconnect with bounded exponential backoff.

### Evidence

The production web build, room event integration tests, and a live request
through the Vite proxy verify the startup and proxy contract.

## 2026-08-23 - Reveal controls ignored mode rules

### Failure

Every locked mode exposed the same reveal action, including Crowd Meter,
Question Board, and other rounds whose results were already live.

### Root cause

Reveal eligibility was inferred independently in each interface instead of
being part of the shared activity contract.

### New invariant/check

A shared activity policy marks blind-result and sealed-truth rounds as
reveal-gated. Live-result rounds finish when locked, omit the reveal control,
and reject direct reveal calls. Prediction Battle always retains reveal because
its truth is sealed even when guesses are visible. Crowd Meter and Question
Board accept only live results.

### Evidence

The policy matrix covers every activity type. Route integration tests verify a
live choice, blind choice, Prediction Battle, and invalid blind settings for
the two always-live modes.

## 2026-08-23 - Future Fork lost the first forecast

### Failure

The first forecast existed only in browser state until the participant made a
revision. A disconnect after opening the evidence erased the original answer
and made the movement analytics incomplete.

### Root cause

The participant flow delayed its only server write until both stages were
complete, while the aggregate assumed every row had both stages.

### New invariant/check

Opening the evidence first persists the initial branch and likelihood. The
later revision updates the same participant response. Initial totals use all
sealed forecasts, while movement and after-distribution metrics use only
completed revisions.

### Evidence

Mode tests include an initial-only response and independently assert sealed
forecast total, revision total, shares, and movement flows.
