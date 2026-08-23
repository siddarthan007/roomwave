# Performance evidence

## 2026-08-23 — Aggregate burst integrity

Scenario:

- 1 room
- 1 live Pulse Choice activity
- 1,000 logical participants
- 1,000 persisted responses in one synthetic burst
- 625 / 375 option split

Observed in the local test run:

- exact total: 1,000
- exact percentages: 62.5% / 37.5%
- serialized aggregate: under 2 KB
- test case wall time reported by Bun: 127 ms in the final recorded run

Scope: this measures local SQLite insertion plus canonical aggregation inside a
test process. It does not establish network p95, SSE fan-out capacity, or stage
FPS. Those require a running multi-client benchmark and browser trace.

## 2026-08-23 — Route payload split

The production build lazy-loads the host, participant, and stage surfaces. The
entry chunk is about 230 KB raw / 74 KB gzip; the participant route is about
86 KB / 27 KB gzip; the stage route is about 51 KB / 17 KB gzip; and the host
route is about 13 KB / 4 KB gzip. The shared realtime room hook is about
122 KB / 40 KB gzip.

This removes the previous single-chunk warning and keeps D3 geometry, drag
sorting, and mode-specific presentation code off routes that do not use them.
Numbers are local Vite production output and should be re-recorded when major
dependencies or route composition changes.
