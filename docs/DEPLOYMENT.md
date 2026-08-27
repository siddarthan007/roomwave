# Roomwave deployment

Roomwave has a static React client and a stateful Bun API. The API owns SQLite data, room timers, presence leases, reaction buckets, and live SSE subscribers. That distinction decides where each part can run.

## Supported layouts

| Layout | Web | API and realtime | Status | Cost fit |
| --- | --- | --- | --- | --- |
| Single VPS | Bun serves the built web app | Bun plus a persistent SQLite volume | Fully supported | No added cost on an existing VPS |
| Vercel plus VPS | Vercel static Vite site | Existing VPS | Fully supported | Vercel Hobby for personal projects plus the VPS you already have |
| Cloudflare Pages plus VPS | Pages static Vite site | Existing VPS | Fully supported | Pages free tier plus the VPS you already have |
| Cloudflare native | Worker assets | SQLite Durable Object plus hibernating WebSockets | Architecture target, not a drop-in build | Can fit the Workers Free plan after the state adapter is implemented |
| Vercel only | Static site and Functions | No supported WebSocket server and no durable local SQLite | Not supported | Do not deploy the current API this way |

The recommended first release is the single VPS layout. It preserves one canonical room process and requires no new distributed state.

## Single VPS

Requirements:

- Linux VPS with Docker and Docker Compose
- a domain pointed at the VPS
- Caddy, nginx, or another TLS reverse proxy

Create a `.env` beside `compose.production.yml`:

```env
ROOMWAVE_ALLOWED_ORIGINS=https://room.example.com
```

Build and start:

```sh
docker compose -f compose.production.yml up -d --build
```

The container serves the SPA and API on `127.0.0.1:3000` through host networking. SQLite lives in the named `roomwave_data` volume. The root filesystem is read-only and the process runs as the unprivileged Bun user.

Minimal Caddy configuration:

```caddyfile
room.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000 {
    flush_interval -1
  }
}
```

`flush_interval -1` sends each SSE chunk as it is written. Without it, Caddy may hold live votes and reactions until a buffer fills or the tab refreshes.

Check readiness:

```sh
curl --fail https://room.example.com/api/health
```

Back up the named volume or stop the service briefly and copy `roomwave.sqlite`, `roomwave.sqlite-wal`, and `roomwave.sqlite-shm` together. Never copy only the main database file while writes are active.

## Vercel frontend plus VPS API

`vercel.json` builds the monorepo web app and keeps SPA deep links working.

Set these Vercel build variables:

```env
VITE_PUBLIC_URL=https://roomwave.vercel.app
VITE_API_URL=https://api.room.example.com
```

Set the API allowlist on the VPS:

```env
ROOMWAVE_ALLOWED_ORIGINS=https://roomwave.vercel.app
```

Rebuild the frontend whenever `VITE_API_URL` changes because Vite injects it at build time.

The Vercel deployment is frontend-only. Vercel Functions cannot act as a WebSocket server, and the current API also depends on persistent SQLite and process-owned room state.

## Cloudflare Pages frontend plus VPS API

Use these Pages build settings from the repository root:

```text
Build command: bun run build:web
Output directory: apps/web/dist
```

Set:

```env
VITE_PUBLIC_URL=https://roomwave.pages.dev
VITE_API_URL=https://api.room.example.com
```

The included `_redirects` file preserves `/host`, `/join`, `/room`, and `/stage` deep links. Add the Pages origin to `ROOMWAVE_ALLOWED_ORIGINS` on the API.

## Cloudflare dashboard (domain cache and live streams)

Roomwave's live stage is an SSE stream at `/api/rooms/:id/events` plus short HTTP commands. If Cloudflare caches or buffers those paths, votes and reactions only appear after a refresh. Use these dashboard settings whether Cloudflare sits in front of a VPS or only serves Pages.

### DNS

| Record | Proxy status | Why |
| --- | --- | --- |
| Apex / `www` / Pages custom domain | Proxied (orange cloud) | CDN for the static app |
| `api` (VPS origin) | DNS only (grey cloud) **or** Proxied with the cache rules below | Grey cloud is the safest SSE path. Orange cloud is fine if `/api` is set to Bypass |

If the web app and API share one hostname, keep it Proxied and rely on the Cache Rules.

### SSL/TLS

- Overview: **Full (strict)**
- Edge Certificates: **Always Use HTTPS** on
- Minimum TLS Version: **1.2**
- Automatic HTTPS Rewrites: on

### Caching → Configuration (zone defaults)

- Caching Level: **Standard**
- Browser Cache TTL: **Respect Existing Headers**
- Crawler Hints: optional
- Always Online: off for a live event product (stale HTML is worse than a brief outage)

Do not enable **Cache Everything** on the zone. That setting will cache HTML shells and can intercept `/api`.

### Caching → Cache Rules

Create two rules, in this order. Newer Cloudflare UI: **Rules → Cache Rules**.

**1. Bypass the API and event stream (first, most specific)**

- When incoming requests match:
  - **URI Path** starts with `/api/`
  - or **Hostname** equals `api.yourdomain.com` (if the API is a subdomain)
- Then:
  - Cache eligibility: **Bypass cache**
  - Origin cache control: **Respect origin**
  - Place at the **top** of the list

**2. Cache hashed static assets**

- When: **URI Path** starts with `/assets/` or `/emoji/` or `/fonts/`
- Then:
  - Cache eligibility: **Eligible for cache**
  - Edge TTL: **1 year** (or "Ignore cache-control header" with a 1-year override)
  - Browser TTL: **Respect origin** (the app already sends `immutable` on hashed files)
  - Origin cache control: **Respect origin**

Optional third rule for the SPA shell:

- When: **URI Path** equals `/` or **URI Full** matches `/(host|join|room|stage|presenter)/.*`
- Then: **Bypass cache** (Pages `_headers` already uses `max-age=0, must-revalidate` for `index.html`)

### Rules → Configuration Rules (API hostname or `/api/*`)

Disable features that rewrite or delay responses:

- Rocket Loader: **off**
- Auto Minify (HTML, CSS, JS): **off**
- Email Address Obfuscation: **off**
- Browser Integrity Check: keep on for HTML; if the API hostname is separate, you can leave it on
- Mirage / Polish: **off** on the API hostname

Rocket Loader in particular breaks `EventSource`.

### Speed → Optimization

For the zone that fronts the API:

- Auto Minify: all off
- Rocket Loader: off
- Early Hints: optional for the static site, not required for `/api`

### Network

- HTTP/2: on
- HTTP/3 (QUIC): on is fine for the static site; if SSE stalls only on HTTP/3, create a Configuration Rule to disable HTTP/3 for `/api/*`
- WebSockets: on (unused today; harmless)
- gRPC: off
- Pseudo IPv4: off
- 0-RTT: off for the API hostname (replay risk on POST)

### Security

- Security Level: **Medium**
- Bot Fight Mode: avoid on the API hostname if participants join from school/conference NATs and get challenged mid-vote
- WAF custom rule (optional): skip Browser Integrity / challenge for `URI Path` starts with `/api/rooms/` and `URI Path` contains `/events`

### Pages project (if the frontend is on Pages)

Build:

```text
Build command: bun run build:web
Output directory: apps/web/dist
```

Environment variables:

```env
VITE_PUBLIC_URL=https://your.pages.dev
VITE_API_URL=https://api.yourdomain.com
```

Pages Caching: leave default. `_headers` in `apps/web/public/_headers` already marks `/assets` immutable and `/api` as `no-store`. Those `/api` lines only apply if Pages is asked to serve `/api`; the VPS still must send `Cache-Control: no-store` on the event stream (the API already does).

### Quick verification

After saving rules, in a live room:

1. DevTools → Network → the `events` request stays **pending** (not 200 with a finished body).
2. Response headers include `content-type: text/event-stream` and `cf-cache-status: DYNAMIC` or `BYPASS`, never `HIT`.
3. A vote on a phone moves the projector **without** switching tabs.

If `events` shows `cf-cache-status: HIT` or the transfer size jumps only after you leave the tab, the Bypass rule is not matching. Check hostname vs path, and that no older Page Rule with Cache Everything sits above it. **Page Rules are deprecated**; migrate them to Cache Rules and delete the Cache Everything rule.

## Why Socket.IO is not installed

Roomwave commands are short authenticated HTTP requests. Realtime output is a one-way SSE stream that begins every connection with a canonical snapshot, sends a five-second heartbeat, applies backpressure, and lets the browser reconnect after two seconds.

Socket.IO would add value when a mode needs continuous bidirectional messages, per-message acknowledgements, or rooms shared across multiple realtime processes. It would also add sticky-session requirements for long-polling, an external adapter for multiple servers, and a second recovery contract. The standard Redis adapter does not support Socket.IO connection-state recovery.

The current workload does not justify those costs. Keep SSE for the Bun release. If latency measurements later show a continuous-input game needs WebSockets, use one of these measured migrations:

1. Bun native topic pub/sub for one process.
2. Cloudflare Durable Objects with hibernating WebSockets for a Cloudflare-native port.
3. Socket.IO with a recovery-compatible adapter and a load balancer configured for sticky sessions.

Do not run Socket.IO inside Vercel Functions. Vercel does not support Functions acting as WebSocket servers.

## Cloudflare-native port boundary

A Cloudflare deployment is a separate state adapter, not a change of import path. The port must replace:

- `bun:sqlite` and Drizzle queries with SQLite Durable Object storage or D1;
- in-process `roomHub`, `presenceHub`, and deadline timers with one Durable Object per room;
- `setTimeout` deadlines with Durable Object alarms;
- SSE subscribers with the hibernation WebSocket API or a Workers-compatible stream contract;
- process memory assumptions with persisted room snapshots and idempotent alarm handlers.

Cloudflare recommends SQLite-backed Durable Objects and hibernating WebSockets for this type of coordinated realtime application. A room-per-object design preserves serialized commands and avoids a global singleton.

## Release environment checklist

- Use a long random host token, which Roomwave already generates and stores only as a hash.
- Set an exact `ROOMWAVE_ALLOWED_ORIGINS` list. The API rejects wildcard configuration.
- Set `ROOMWAVE_TRUSTED_PROXY_IPS` only to the actual reverse-proxy peer addresses.
- Persist and back up the SQLite volume.
- Terminate TLS at the reverse proxy.
- Keep one Bun API replica until realtime state is moved to a shared adapter.
- Monitor `/api/health`, disk space, open SSE connections, response latency, and room expiry.
