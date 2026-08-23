# Roomwave

Roomwave is a realtime audience stage: participants join by short code, answer
from a phone, and visibly change a shared projector surface.

## What is implemented

- Pulse Choice with live or blind results, consensus, and a Minority Wins rule
- Spectrum, Hot Take Duel, and Before / After for position, tension, and movement
- Prediction Battle with server-hidden truth and a staged reveal
- Word Bloom and Question Board for bounded public text and a voted stage queue
- Crowd Meter with bounded repeated taps and rolling pressure decay
- Rank Race with touch, pointer, keyboard sorting and room-wide Borda scoring
- Quadrant Drop with a two-axis placement surface, centroid, shares, and outliers
- Reality Bender with perceived-versus-actual distributions and misread analytics
- Living Consensus with confidence-weighted agreement, polarization, and a responsive organism
- Future Fork with a forecast, evidence reveal, revision flow, and anonymous branch movement
- Cipher Room with a sealed Caesar-shift answer, timer, confidence, and reveal wheel
- Shadow Council with fictional aliases, an exact suspicion budget, tribunal target, sealed identity, and reveal scoring
- mode-aware host lock, reopen, reveal, reset, and end controls
- exact joined/responded counts, five-second momentum, SSE snapshots, and reconnect
- authenticated, sampled reaction swarms with reduced-motion fallback
- high-variety deterministic anonymous names and pixel characters generated from the room session only
- host moderation for public text, with review-before-stage enabled by default
- bounded lexical themes for Word Bloom using native tokenization, without profiling
- mobile-safe gesture fallbacks, responsive stage graphics, and route-level code splitting

## Run locally

Start the API and web app together from the repository root:

```text
bun run dev
```

Open `http://localhost:5173`.

`dev:api` and `dev:web` remain available for separate terminals. When the web
app runs alone, its `/api` proxy has no backend and will correctly report that
the Roomwave API is offline.

Copy `.env.example` when you need non-default ports, a public invite origin, or
a SQLite file on a persistent volume. `VITE_PUBLIC_URL` is compiled into the web
build and must be the browser-reachable HTTPS origin in production.
Set `VITE_API_URL` when the static frontend and API use different origins.
Only add reverse-proxy socket addresses to `ROOMWAVE_TRUSTED_PROXY_IPS`; direct
client forwarding headers are ignored, and trusted chains are walked from the
server outward before a rate-limit identity is chosen.

The API applies checked-in Drizzle migrations to `ROOMWAVE_DB_PATH` before it
serves requests. A complete database from releases that predate migration
tracking is repaired and baselined without replaying table creation. A partial
Roomwave schema fails closed with a restore instruction instead of guessing
through possible corruption.

## Verify

```text
bun run check
```

The burst integrity test inserts 1,000 logical participant responses and checks
exact totals, percentages, and bounded aggregate payload size. It is a database
and aggregation test, not an HTTP latency or browser FPS claim.

## Release boundary

Roomwave currently targets one API process backed by SQLite WAL and an in-memory
event hub. The API applies trusted-peer rate limits, request-size limits,
connection ceilings, append-only round quotas, expiry checks, and lifecycle
compare-and-swap guards. Joined count means durable anonymous room sessions; it
does not claim that every participant is currently online.

Before a public release:

1. Back up the persistent database volume before deploying an image with new
   migrations. The API applies pending checked-in migrations during startup.
2. Terminate TLS at a reverse proxy and preserve streaming responses with a
   proxy idle timeout longer than the five-second SSE heartbeat.
3. Run one API process per SQLite database. Horizontal scaling needs a shared
   event bus, distributed limits, and a database designed for concurrent writers.
4. Run `bun run check`, dependency advisory checks, a production-origin smoke
   test, and a representative phone plus projector load test.
5. Verify SQLite restore before inviting a real audience.

Product and implementation rules live in `PRD.md`, `ARCHITECTURE.md`,
`ARCHITECTURE-ESSENTIALS.md`, and `AGENT.md`.
Deployment layouts and their limits are documented in `docs/DEPLOYMENT.md`.
