# shhheth weekly delta — design

**Date:** 2026-05-29
**Status:** Approved design, pending spec review

## Why

A cumulative total is a monument — you look once. Change is news, and news gets
reshared. A "shielded this week" delta gives shhheth a fresh, true, specific
number on every visit, and the seed of a recurring posting cadence
("+18,400 ETH shielded in the last 7 days").

This spec covers **on-site display only**. No X API, no cron, no posting
automation. The number lives in the white odometer screen and updates with the
existing 60s ISR window.

## Scope

In scope:
- Compute a rolling 7-day delta for the aggregate total and for each live protocol.
- Show the aggregate delta in the white screen by default.
- Show a protocol's delta on hover, reusing the existing segment hover-swap.

Explicitly out of scope (YAGNI for v1):
- X API / auto-posting / draft generation.
- Persisted snapshots, cron jobs, new storage.
- Configurable windows (daily/monthly). Fixed at 7 days.
- Zcash / non-ETH protocols (parked).

## Feasibility (proven, not assumed)

The subgraphs already store cumulative running totals, and Goldsky serves
historical state via The Graph time-travel queries. Verified live against the
0xbow endpoint on 2026-05-29:

- now (block 25,197,843): `3,116.83 ETH`
- ~7d ago (block 25,147,443): `3,043.62 ETH`
- → 0xbow 7-day delta = **+73.2 ETH**

Each subgraph also reports its indexing start block in the time-travel error
path; queries inside the 7-day window are well within range. No pruning issue
for our window.

## Data layer

The cumulative counter is monotonic, so:

```
deltaETH = total_now − total_at_block_7d_ago
```

### Resolving "7 days ago"

1. One `_meta { block { number timestamp } }` query gets the current chain head.
   All four subgraphs index the same Ethereum mainnet, so a single head query
   serves all of them.
2. `block7dAgo = head − 50_400` (≈ 7 d at 12 s/block). Drift is a few minutes —
   irrelevant for a weekly stat. `timestamp` from `_meta` is used only to render
   the window label honestly if we want it.

Using chain head (not a protocol's `lastUpdatedBlock`) is required: a protocol
with no recent deposits has a stale `lastUpdatedBlock`, and subtracting from it
would query before its last activity and produce a wrong baseline.

### Per-protocol fetch

Each protocol fetches current + historical in a **single aliased request**,
keeping the "adding a protocol never touches the others" isolation principle:

```graphql
{
  current: bowGlobal(id: "1") { totalShieldedETH lastUpdatedBlock }
  prior:   bowGlobal(id: "1", block: { number: 25147443 }) { totalShieldedETH }
}
```

Request budget: 1 head query + 4 protocol queries = 5 (was 4), via
`Promise.allSettled`. No change to subgraph deployments.

### Delta math

- `prior` null (protocol didn't exist 7d ago) → treat prior as `0`, so the whole
  current total counts as this week's inflow. Correct for brand-new protocols.
- `deltaETH = max(current − prior, 0)` — clamp negatives. Cumulative counters
  never decrease; a negative is a reorg/data glitch, not a real number.
- Aggregate `deltaETH = Σ per-protocol deltaETH`.
- Per-protocol **share of the week** = `protocolDelta / aggregateDelta` (guard
  `aggregateDelta === 0` → no share shown). Shares sum to 100% since all deltas
  are non-negative.

### Type changes (minimal, additive)

- `ProtocolResult` + `deltaETH: bigint`
- `Snapshot` + `deltaETH: bigint`, `windowDays: number`
- `DisplayProtocol` + `deltaWei: string`, `formattedDelta: string`,
  `weekSharePct: number`
- New per-protocol adapter return includes the historical value; the head/block
  resolution lives in `getTotals` (it's cross-protocol) and is passed into each
  fetch.

## Display layer (the white screen)

Reuses the existing hover-swap in `OdometerStage` — `displayValue`/`sublabel`
already swap per protocol when a `BreakdownSegment` is hovered. We add **one
delta line** beneath `BraunDigits`.

- **Default (nothing hovered):**
  - big number = cumulative total (unchanged)
  - delta line → `▲ +18,400 ETH · last 7 days`
- **Hovering a protocol:**
  - big number = that protocol's cumulative total (unchanged)
  - delta line → `▲ +312 ETH · 60% of this week`
    (absolute + share of the week's inflow — "Both")

Styling: matches the screen (mono, muted). Positive deltas use a green ▲; a zero
delta (e.g. sunset Aztec) renders a dim `flat` rather than `+0`. The delta line
is the recurring-content payload — it is the one new visual element.

## Edge cases & guardrails

| Case | Behavior |
|------|----------|
| Negative delta (reorg/glitch) | Clamp to 0 |
| `prior` null (new protocol) | prior = 0; full total is this week |
| Sunset protocol (Aztec) | delta 0 → renders `flat` |
| Historical query fails, current OK | Show total, hide that protocol's delta line |
| Aggregate delta 0 | Hide share %; show `flat` |
| Head query fails | Snapshot still returns totals; delta omitted (graceful) |

## Testing

The codebase has no tests today, so keep it light and focused on pure math:

- `computeDelta(current, prior)` — normal, prior-null, negative-clamp.
- delta formatting — sign prefix, `flat` at 0, comma grouping.
- `weekShare(protocolDelta, aggregateDelta)` — normal, div-by-zero guard.

No component/integration tests in v1.

## Files touched (anticipated)

- `web/src/lib/protocols.ts` — adapters return historical value; query gains
  `prior` alias + `_meta`.
- `web/src/lib/subgraph.ts` — head/block resolution, delta math, type additions,
  formatting helpers.
- `web/src/app/components/OdometerStage.tsx` — render delta line, swap on hover.
- `web/src/app/globals.css` — delta line styling.
- New: a small test file for the pure helpers.
