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
  reverse_proxy 127.0.0.1:3000
}
```

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
