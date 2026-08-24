# 004 — Networking: SSE priority hints and stage preconnect

- **Status**: TODO
- **Commit**: 735b33e
- **Severity**: MEDIUM
- **Category**: Networking enhancement
- **Estimated scope**: 2 files, ~15 lines

## Problem

The stage page opens its EventSource only after React hydrates and the first
`useEffect` runs. On a cold load over hotel/classroom wifi that is 300–800ms
of dead time before the stream even starts connecting, and the first snapshot
arrives after that. There are also no resource hints for the API origin, so
DNS+TLS to the backend happens serially with hydration.

Additionally `use-room.ts` polls every 15s *only when the stream is down*
(correct since plan), but the poll path creates a new `AbortController`-less
fetch each time with no timeout — a hung request can stack.

## Target

1. **Preconnect hint** in `apps/web/index.html` `<head>`:

```html
<link rel="preconnect" href="http://127.0.0.1:3000" />
```

   (Dev convenience; production same-origin needs no hint. Guard with a
   comment. If `VITE_PUBLIC_API` exists, prefer it — check vite.config proxy.)

2. **Fetch timeout** for the polling path in `apps/web/src/hooks/use-room.ts`:
   wrap `getRoomState` calls made by the interval in
   `Promise.race([fetch, timeout(5_000)])` via `AbortSignal.timeout(5_000)`
   (baseline: supported Chrome/Edge/Safari 16.4+/FF 100+). AbortError is
   already swallowed by the existing `.catch`.

3. **SSE fetch priority**: add `priority: "high"` to nothing — EventSource
   does not accept it; instead ensure the heartbeat interval (server, 5s)
   stays as-is. No change needed; documented so executors don't "fix" it.

## Repo conventions to follow

- `index.html` at `apps/web/index.html` already carries meta/theme tags in
  `<head>`; add the link there.
- The api client (`lib/api.ts`) uses bare `fetch`; do not refactor it — the
  timeout lives at the call site in use-room.ts only.

## Steps

1. Edit `apps/web/index.html`: add preconnect link for the dev API origin
   with an HTML comment explaining production is same-origin.
2. Edit `use-room.ts` refresh(): change `getRoomState(roomId)` to
   `getRoomState(roomId, { signal: AbortSignal.timeout(5_000) })` ONLY if
   `getRoomState` accepts an init param — check lib/api.ts first. If it does
   not, add an optional `init?: RequestInit` passthrough there.
3. `bun run check`.

## Boundaries

- Do NOT add service workers, websockets, or background sync.
- Do NOT change the server heartbeat cadence (5s is correct for Cloudflare's
  ~100s idle window).
- Do NOT touch EventSource construction in use-room-stream.ts.

## Verification

- **Mechanical**: build green; network tab shows `/events` request starting
  earlier than first content paint on a cold cache (dev throttling "Slow 4G").
- **Feel check**: kill the API process mid-session; the participant page
  shows "reconnecting" within ~11s (watchdog) and recovers automatically when
  the API returns, replaying missed events.
- **Done when**: hung polls can no longer stack (timeout evidence in network
  tab) and preconnect is present in served HTML head.
