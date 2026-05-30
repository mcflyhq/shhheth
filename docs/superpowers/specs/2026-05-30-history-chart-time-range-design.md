# shhheth history chart + unified time-range — design

**Date:** 2026-05-30
**Status:** Approved design, pending spec review

## Why

The site shows one cumulative number plus a fixed 7-day delta. Meanwhile every
subgraph already indexes a full **daily-inflow time-series** (`*DailyInflow`,
wei/day keyed by day-since-epoch) that the site never surfaces. Turning that
into a chart + a time-range control makes the monument a trend people return to,
and produces better share images. This iteration covers ideas #1 (history
chart + per-protocol sparklines) and #2 (time-range toggle).

## Scope

In scope:
- A unified time-range control (`7d · 30d · 90d · All`) that drives **both** the
  delta headline and a chart.
- A stacked-by-protocol chart: daily-inflow bars for windowed ranges, a
  weekly-bucketed cumulative area for All.
- Per-protocol inflow sparklines in the breakdown cards.
- Replace the time-travel delta engine with daily-bucket sums (one data source).

Out of scope (YAGNI for this iteration):
- 24h range (daily granularity can't render sub-day; a 24h number can live in
  share text later).
- A charting library (hand-rolled SVG instead).
- Hourly/intraday data, USD valuation, new protocols.

## Data source (verified live)

Each protocol's subgraph exposes a daily series. Confirmed populated on all four
live endpoints on 2026-05-30, e.g.:

```
bowDailyInflows / railgunDailyInflows / tornadoDailyInflows / dailyInflows
  { date  shieldedETH }     # date = floor(block.timestamp / 86400), shieldedETH = wei that day
```

Field names per protocol (the query field is the lowercased entity, pluralized):

| Protocol | Endpoint entity | Query field |
|----------|-----------------|-------------|
| Aztec | `DailyInflow` | `dailyInflows` |
| Tornado | `TornadoDailyInflow` | `tornadoDailyInflows` |
| Railgun | `RailgunDailyInflow` | `railgunDailyInflows` |
| 0xbow | `BowDailyInflow` | `bowDailyInflows` |

Only days **with activity** have rows; gaps mean zero and must be zero-filled.

## Architecture

### Data layer (`web/src/lib/`)

A new module owns the daily series; `subgraph.ts`'s delta logic is rewired to
consume it.

- `getDailySeries()` — `cache()`-wrapped, fan-out across protocols via
  `Promise.allSettled` (same isolation as `getTotals`). Per protocol:
  - Windowed needs only recent days → `… (orderBy: date, orderDirection: desc, first: 90)`.
  - All needs the full history → paginate by `date` (Graph caps `first` at 1000;
    Tornado is ~2,400 days) then **weekly-bucket** server-side.
  - Each daily field is configured per protocol alongside the existing `entity`
    in `protocols.ts` (add `dailyField`, e.g. `"bowDailyInflows"`).
- Normalize into an aligned series:
  ```ts
  type DayPoint = { date: number; perProtocol: Record<string, bigint>; total: bigint };
  type DailySeries = { days: DayPoint[] };   // contiguous, zero-filled, ascending date
  ```
- `windowSum(series, days)` → aggregate + per-protocol `bigint` totals for the
  last `days` buckets. This **replaces** the time-travel `computeDelta` path:
  the headline delta becomes `windowSum(series, rangeDays).total`. Same metric
  (gross deposits in window); bucketing shifts from rolling-168h to UTC-day.
- `weeklyBuckets(series)` → downsampled cumulative series for All mode
  (running total per ISO week, per protocol).

`getTotals()` keeps returning the cumulative grand total **and a default 7d
`deltaETH`**, but that delta is now `windowSum(getDailySeries(), 7).total`
instead of a time-travel diff. This keeps the `Snapshot` shape stable, so the
**OG image (`opengraph-image.tsx`) and Share-on-X text are untouched** — they
keep reading `snapshot.deltaETH`. Both `getTotals` and `getDailySeries` are
`cache()`-wrapped, so the shared series is fetched once per request. The
`_meta`/historical-block time-travel fetch in `subgraph.ts` is deleted.

### Pure helpers (unit-tested)

- `zeroFill(rows, fromDate, toDate)` — fill missing day buckets with 0.
- `alignByDate(perProtocolRows)` — merge protocol series into `DayPoint[]`.
- `windowSum(series, days)` — window aggregate + per-protocol split.
- `weeklyBuckets(series)` — cumulative weekly downsample.
- `cumulative(series)` — running totals (for All area + sparkline cum option).

### Components (`web/src/app/components/`)

- `RangeToggle` (client) — `7d | 30d | 90d | All`, default 7d. Holds the active
  range in `OdometerStage` state; drives both the delta line and the chart.
- `InflowChart` (client) — hand-rolled inline **SVG**.
  - Windowed: stacked bars, one stack per day, segmented by protocol color
    (`ProtocolConfig.color`), **y-axis anchored at 0**.
  - All: stacked **area** over weekly buckets, cumulative.
  - Hover a day/column → minimal tooltip: date + day total (per-protocol split is
    a later enhancement). Reuses the existing protocol color map.
- `Sparkline` (pure SVG, server-renderable) — tiny axis-less inflow line; dropped
  into each `ProtocolList` card from that protocol's recent daily series.
- `OdometerStage` — renders `RangeToggle` + `InflowChart` under the breakdown
  bar; the existing delta line reads the active range's `windowSum`. The
  per-protocol segment hover-swap is unchanged.

### Data flow

`page.tsx` (server) calls `getTotals()` + `getDailySeries()`, derives the
windowed series + All series, passes them to `OdometerStage`. The client toggle
switches between precomputed ranges — **no client refetch** (all ranges are in
the payload; All is already weekly-bucketed so payload stays small).

## Visualization discipline (Tufte)

Bars start at zero (no lie factor); no gridlines or chartjunk; sparklines carry
no axes/labels; protocol colors are the legend (no separate legend chrome);
weekly buckets for All prevent overplotting ~2,400 daily points. Final treatment
to be reviewed with the `tufte-viz` skill during implementation.

## Layout / responsive

The chart sits inside `screen-content`, under the breakdown bar. Height is
clamped (`clamp()`); on the shorter mobile screen the chart compacts and the
range toggle stays tappable. The white-screen vertical budget is tight — the
chart must fit without pushing the breakdown off-screen on iPhone-class
viewports (the existing mobile overrides in `globals.css` are the reference).

## Edge cases

| Case | Behavior |
|------|----------|
| Missing day rows | zero-fill the gap |
| Protocol with no history in window | absent from that day's stack (0) |
| Sunset protocol (Aztec) | flat 0 inflow recently; still in legend/colors |
| All-mode pagination cap | paginate by date until exhausted, then weekly-bucket |
| A protocol's daily query fails | that protocol omitted from the series; others render; grand total still from `getTotals()` |
| Empty/zero series | chart renders an empty baseline, delta shows `flat` |

## Testing

Vitest (already configured) on the pure transforms only: `zeroFill`,
`alignByDate`, `windowSum` (incl. per-protocol split + bucket-edge), `weeklyBuckets`,
`cumulative`. No component/visual tests this iteration.

## Files touched (anticipated)

- `web/src/lib/protocols.ts` — add `dailyField` per protocol.
- `web/src/lib/daily.ts` (new) — series fetch + pure transforms.
- `web/src/lib/subgraph.ts` — delta derived from series; remove time-travel/`_meta`.
- `web/src/app/page.tsx` — fetch series, pass ranges down.
- `web/src/app/components/RangeToggle.tsx` (new)
- `web/src/app/components/InflowChart.tsx` (new)
- `web/src/app/components/Sparkline.tsx` (new)
- `web/src/app/components/OdometerStage.tsx` — host toggle + chart, range-aware delta.
- `web/src/app/components/ProtocolList.tsx` — sparkline per card.
- `web/src/app/globals.css` — chart, toggle, sparkline styles.
- New test file for the daily transforms.
