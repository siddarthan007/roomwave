# plans — Roomwave motion & networking improvements

Audit source: improve-animations skill (AUDIT.md categories), commit `735b33e`.
Antislop-ui constraints applied: every plan documents purpose (R-31), respects
reduced-motion (R-19/§6), stays within the repo's print-poster identity.

| # | Plan | Severity | Category | Status |
|---|------|----------|----------|--------|
| 001 | [Motion token system](001-motion-tokens.md) | MEDIUM | Cohesion & tokens | TODO |
| 002 | [Live analytics count-up (NumberFlow)](002-live-analytics-countup.md) | HIGH | Missed opportunities | TODO |
| 003 | [scale(0) origins + reduced-motion gates](003-scale-origin-reduced-motion.md) | HIGH | Physicality / Accessibility | TODO |
| 004 | [Preconnect + poll timeout](004-network-preconnect-timeout.md) | MEDIUM | Networking | TODO |

## Recommended execution order

1. **001** — tokens first; later plans reference the curve values.
2. **003** — correctness/accessibility fixes, no dependencies.
3. **002** — highest user-visible impact (projector numbers roll); needs 001's
   easing values only for consistency.
4. **004** — independent; can run any time.

## Dependencies

- 002 cites 001's cubic-bezier but does not require it to be merged first.
- No other cross-dependencies.
