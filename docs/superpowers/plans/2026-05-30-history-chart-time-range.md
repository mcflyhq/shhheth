# History Chart + Unified Time-Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the already-indexed daily-inflow time-series as a stacked-by-protocol chart driven by a unified `7d · 30d · 90d · All` range toggle, plus per-protocol sparklines, and rewire the headline delta onto the same data source.

**Architecture:** One server-side data module (`daily.ts`) fetches each protocol's `*DailyInflow` series, aligns + zero-fills it into a bigint-precise daily series, and derives windowed sums and a weekly-bucketed cumulative series. `page.tsx` converts these to serializable ETH-number chart points + formatted delta strings per range and passes them to client components (`RangeToggle`, `InflowChart`, `Sparkline`) hosted by `OdometerStage`. The time-travel delta engine in `subgraph.ts` is deleted; `getTotals` derives its 7d delta from the series so the OG image / share text are untouched.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, graphql-request, hand-rolled inline SVG (no charting dep), Vitest 3.

---

## Working agreements

- Run all commands from `web/` unless stated. Tests: `pnpm exec vitest run`. Types: `pnpm exec tsc --noEmit`. Lint: `pnpm exec eslint src`.
- **Serialization rule:** never pass `bigint` across the server→client boundary. `daily.ts` works in `bigint` (wei, precise); `page.tsx` converts to `number` (ETH) for chart geometry and pre-formatted `string` for displayed deltas. Client components receive only `number`/`string`. This matches the existing `DisplayProtocol.totalWei: string` pattern.
- Protocol stack order is the order of `PROTOCOLS` in `protocols.ts` (stable colors across days).
- Commit after each task with the message shown.

## File structure

- `web/src/lib/protocols.ts` — modify: add `dailyField` per protocol.
- `web/src/lib/daily.ts` — **new**: series types, pure transforms, `getDailySeries()` fetch.
- `web/src/lib/daily.test.ts` — **new**: unit tests for the pure transforms.
- `web/src/lib/subgraph.ts` — modify: delete time-travel; derive `deltaETH` from the series.
- `web/src/app/page.tsx` — modify: build per-range chart points + delta strings.
- `web/src/app/components/RangeToggle.tsx` — **new**.
- `web/src/app/components/InflowChart.tsx` — **new**.
- `web/src/app/components/Sparkline.tsx` — **new**.
- `web/src/app/components/OdometerStage.tsx` — modify: range state, host chart+toggle, range-aware delta.
- `web/src/app/components/ProtocolList.tsx` — modify: sparkline per card.
- `web/src/app/globals.css` — modify: toggle/chart/sparkline styles.

---

## Task 1: Add `dailyField` to protocol config

**Files:**
- Modify: `web/src/lib/protocols.ts`

- [ ] **Step 1: Add `dailyField` to the `ProtocolConfig` type**

In `web/src/lib/protocols.ts`, add to the `ProtocolConfig` type (after `entityId`):

```ts
  /** Root query field for this subgraph's daily-inflow series, e.g. "bowDailyInflows". */
  dailyField?: string;
```

- [ ] **Step 2: Set `dailyField` on each protocol**

Add the field to each entry in `PROTOCOLS`:

```ts
  // aztec
  entity: "global", dailyField: "dailyInflows",
  // tornado
  entity: "tornadoGlobal", dailyField: "tornadoDailyInflows",
  // railgun
  entity: "railgunGlobal", dailyField: "railgunDailyInflows",
  // 0xbow
  entity: "bowGlobal", dailyField: "bowDailyInflows",
```

(Keep each entry's existing fields; only add `dailyField`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/protocols.ts
git commit -m "feat(web): add dailyField to protocol config"
```

---

## Task 2: Pure daily-series transforms (TDD)

**Files:**
- Create: `web/src/lib/daily.ts`
- Test: `web/src/lib/daily.test.ts`

The day key is `floor(block.timestamp / 86400)` (a "day number"). `shieldedETH` is wei. Only days with activity have rows.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/daily.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  alignByDate,
  windowSum,
  cumulative,
  weeklyBuckets,
  lastN,
  type RawDay,
} from "./daily";

const wei = (n: bigint) => n * 10n ** 18n;

describe("alignByDate", () => {
  it("merges protocols onto a contiguous, zero-filled, ascending day axis", () => {
    const s = alignByDate({
      a: [{ date: 10, wei: wei(1n) }, { date: 12, wei: wei(3n) }],
      b: [{ date: 11, wei: wei(5n) }],
    });
    expect(s.days.map((d) => d.date)).toEqual([10, 11, 12]);
    expect(s.days[0].perProtocol).toEqual({ a: wei(1n), b: 0n });
    expect(s.days[1].perProtocol).toEqual({ a: 0n, b: wei(5n) });
    expect(s.days[1].total).toBe(wei(5n));
    expect(s.days[2].total).toBe(wei(3n));
  });

  it("returns an empty series when there are no rows", () => {
    expect(alignByDate({ a: [], b: [] }).days).toEqual([]);
  });
});

describe("lastN", () => {
  it("returns the last N days", () => {
    const s = alignByDate({ a: [{ date: 1, wei: wei(1n) }, { date: 2, wei: wei(2n) }, { date: 3, wei: wei(3n) }] });
    expect(lastN(s, 2).days.map((d) => d.date)).toEqual([2, 3]);
  });
  it("returns the whole series when N exceeds length", () => {
    const s = alignByDate({ a: [{ date: 1, wei: wei(1n) }] });
    expect(lastN(s, 5).days).toHaveLength(1);
  });
});

describe("windowSum", () => {
  it("sums the last N days, splitting by protocol", () => {
    const s = alignByDate({
      a: [{ date: 1, wei: wei(1n) }, { date: 2, wei: wei(2n) }, { date: 3, wei: wei(4n) }],
      b: [{ date: 2, wei: wei(10n) }],
    });
    const r = windowSum(s, 2); // days 2 and 3
    expect(r.total).toBe(wei(16n));
    expect(r.perProtocol).toEqual({ a: wei(6n), b: wei(10n) });
  });
});

describe("cumulative", () => {
  it("produces running totals per protocol", () => {
    const s = alignByDate({ a: [{ date: 1, wei: wei(1n) }, { date: 2, wei: wei(2n) }] });
    const c = cumulative(s);
    expect(c.days[0].perProtocol.a).toBe(wei(1n));
    expect(c.days[1].perProtocol.a).toBe(wei(3n));
    expect(c.days[1].total).toBe(wei(3n));
  });
});

describe("weeklyBuckets", () => {
  it("keeps the last day of each 7-day bucket", () => {
    // dates 1..15 each +1 ETH, cumulative; buckets are floor(date/7)
    const rows: RawDay[] = Array.from({ length: 15 }, (_, i) => ({ date: i + 1, wei: wei(1n) }));
    const c = cumulative(alignByDate({ a: rows }));
    const w = weeklyBuckets(c);
    // buckets: {1..6}->wk0 end date6, {7..13}->wk1 end date13, {14,15}->wk2 end date15
    expect(w.days.map((d) => d.date)).toEqual([6, 13, 15]);
    expect(w.days[2].total).toBe(wei(15n)); // cumulative through day 15
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/daily.test.ts`
Expected: FAIL — `Cannot find module './daily'`.

- [ ] **Step 3: Implement the pure transforms**

Create `web/src/lib/daily.ts` (transforms only for now):

```ts
export type RawDay = { date: number; wei: bigint };

export type DayPoint = {
  date: number;
  perProtocol: Record<string, bigint>;
  total: bigint;
};

export type DailySeries = { days: DayPoint[] };

/** Merge per-protocol raw rows onto one contiguous, zero-filled, ascending day axis. */
export function alignByDate(byProtocol: Record<string, RawDay[]>): DailySeries {
  const ids = Object.keys(byProtocol);
  const lookup: Record<string, Map<number, bigint>> = {};
  let min = Infinity;
  let max = -Infinity;
  for (const id of ids) {
    const m = new Map<number, bigint>();
    for (const r of byProtocol[id]) {
      m.set(r.date, (m.get(r.date) ?? 0n) + r.wei);
      if (r.date < min) min = r.date;
      if (r.date > max) max = r.date;
    }
    lookup[id] = m;
  }
  if (min === Infinity) return { days: [] };

  const days: DayPoint[] = [];
  for (let date = min; date <= max; date++) {
    const perProtocol: Record<string, bigint> = {};
    let total = 0n;
    for (const id of ids) {
      const v = lookup[id].get(date) ?? 0n;
      perProtocol[id] = v;
      total += v;
    }
    days.push({ date, perProtocol, total });
  }
  return { days };
}

export function lastN(series: DailySeries, n: number): DailySeries {
  return { days: series.days.slice(Math.max(0, series.days.length - n)) };
}

export function windowSum(
  series: DailySeries,
  days: number,
): { total: bigint; perProtocol: Record<string, bigint> } {
  const slice = lastN(series, days).days;
  const perProtocol: Record<string, bigint> = {};
  let total = 0n;
  for (const d of slice) {
    total += d.total;
    for (const [id, v] of Object.entries(d.perProtocol)) {
      perProtocol[id] = (perProtocol[id] ?? 0n) + v;
    }
  }
  return { total, perProtocol };
}

export function cumulative(series: DailySeries): DailySeries {
  const running: Record<string, bigint> = {};
  let runningTotal = 0n;
  const days = series.days.map((d) => {
    const perProtocol: Record<string, bigint> = {};
    for (const [id, v] of Object.entries(d.perProtocol)) {
      running[id] = (running[id] ?? 0n) + v;
      perProtocol[id] = running[id];
    }
    runningTotal += d.total;
    return { date: d.date, perProtocol, total: runningTotal };
  });
  return { days };
}

/** Downsample to one point per 7-day bucket (keep the last day of each bucket). */
export function weeklyBuckets(series: DailySeries): DailySeries {
  const out: DayPoint[] = [];
  let bucket = Infinity;
  for (const d of series.days) {
    const b = Math.floor(d.date / 7);
    if (b !== bucket) {
      out.push(d);
      bucket = b;
    } else {
      out[out.length - 1] = d; // last day of bucket wins
    }
  }
  return { days: out };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/daily.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/daily.ts web/src/lib/daily.test.ts
git commit -m "feat(web): daily-series transforms (align, window, cumulative, weekly)"
```

---

## Task 3: Fetch the daily series (`getDailySeries`)

**Files:**
- Modify: `web/src/lib/daily.ts`

Each protocol's daily field returns `{ date, shieldedETH }`. `date` comes back as a string (e.g. `"20603"`), `shieldedETH` as a wei string. The Graph caps `first` at 1000, so the all-time fetch paginates by ascending `date`.

- [ ] **Step 1: Add imports + the fetch function**

At the top of `web/src/lib/daily.ts` add:

```ts
import { cache } from "react";
import { request } from "graphql-request";
import { PROTOCOLS, type ProtocolConfig } from "./protocols";
```

At the bottom of `web/src/lib/daily.ts` add:

```ts
const PAGE = 1000;

type DailyRow = { date: string; shieldedETH: string };

function dailyQuery(field: string, skip: number): string {
  return `{ rows: ${field}(first: ${PAGE}, skip: ${skip}, orderBy: date, orderDirection: asc) { date shieldedETH } }`;
}

async function fetchProtocolDays(config: ProtocolConfig): Promise<RawDay[]> {
  if (!config.endpoint || !config.dailyField || config.status === "soon") return [];
  const out: RawDay[] = [];
  try {
    for (let skip = 0; ; skip += PAGE) {
      const raw = (await request(
        config.endpoint,
        dailyQuery(config.dailyField, skip),
      )) as { rows: DailyRow[] };
      for (const r of raw.rows) out.push({ date: Number(r.date), wei: BigInt(r.shieldedETH) });
      if (raw.rows.length < PAGE) break;
    }
  } catch (error) {
    console.error(`[shhheth] ${config.id} daily query failed:`, error);
    return [];
  }
  return out;
}

/** Per-request memoized aligned daily-inflow series across every live protocol. */
export const getDailySeries = cache(async (): Promise<DailySeries> => {
  const settled = await Promise.allSettled(PROTOCOLS.map(fetchProtocolDays));
  const byProtocol: Record<string, RawDay[]> = {};
  PROTOCOLS.forEach((p, i) => {
    const r = settled[i];
    byProtocol[p.id] = r.status === "fulfilled" ? r.value : [];
  });
  return alignByDate(byProtocol);
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke-test against live endpoints**

Run from `web/`:

```bash
pnpm exec tsx -e "import('./src/lib/daily.ts').then(async m => { const s = await m.getDailySeries(); console.log('days:', s.days.length, 'last:', s.days.at(-1)?.date, 'lastTotalWei:', s.days.at(-1)?.total.toString()); })" 2>/dev/null || node --import tsx -e "import('./src/lib/daily.ts').then(async m => { const s = await m.getDailySeries(); console.log('days:', s.days.length); })"
```

Expected: prints a `days:` count in the hundreds+ and a recent `last:` day number. If `tsx` is unavailable, skip this step — Task 10's build exercises the path.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/daily.ts
git commit -m "feat(web): fetch + paginate daily-inflow series per protocol"
```

---

## Task 4: Rewire the delta onto the series; delete time-travel

**Files:**
- Modify: `web/src/lib/subgraph.ts`
- Modify: `web/src/lib/delta.test.ts`

`getTotals` must keep returning a `Snapshot` with `totalETH` + a 7d `deltaETH` (so `opengraph-image.tsx` and the share text are untouched), but `deltaETH` now comes from `windowSum(series, 7)`.

- [ ] **Step 1: Delete the time-travel internals**

In `web/src/lib/subgraph.ts`, delete: `BLOCKS_PER_WINDOW`, `type Current`, `type GlobalRow`, `currentQuery`, `priorQuery`, `fetchCurrent`, `fetchPrior`, and the `computeDelta` function. Keep `WINDOW_DAYS`, `formatETH`, `formatSignedETH`, `weekShare`, `getDisplayProtocols`, the `Snapshot`/`DisplayProtocol` types, and `import { request }`/`graphql-request` only if still used (it is no longer — remove the `graphql-request` import; keep `cache`).

- [ ] **Step 2: Add a cumulative-total fetch + series-derived delta in `getTotals`**

Replace the `getTotals` definition with:

```ts
import { getDailySeries, windowSum } from "./daily";
import { PROTOCOLS } from "./protocols";

type GlobalRow = { totalShieldedETH: string; lastUpdatedBlock?: string } | null;

async function fetchTotal(config: ProtocolConfig): Promise<ProtocolResult | null> {
  if (!config.endpoint || !config.entity || config.status === "soon") return null;
  try {
    const raw = (await request(
      config.endpoint,
      `{ g: ${config.entity}(id: "${config.entityId ?? "1"}") { totalShieldedETH lastUpdatedBlock } }`,
    )) as { g: GlobalRow };
    if (!raw.g) return null;
    return {
      id: config.id,
      name: config.name,
      status: config.status as Exclude<ProtocolResult["status"], "soon">,
      totalETH: BigInt(raw.g.totalShieldedETH),
      deltaETH: null, // per-protocol window deltas are derived in page.tsx from the series
      lastUpdatedBlock: BigInt(raw.g.lastUpdatedBlock ?? "0"),
    };
  } catch (error) {
    console.error(`[shhheth] ${config.id} total query failed:`, error);
    return null;
  }
}

export const getTotals = cache(async (): Promise<Snapshot> => {
  const [settled, series] = await Promise.all([
    Promise.allSettled(PROTOCOLS.map(fetchTotal)),
    getDailySeries(),
  ]);
  const protocols = settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is ProtocolResult => v !== null);
  const totalETH = protocols.reduce((s, p) => s + p.totalETH, 0n);
  const deltaETH = series.days.length > 0 ? windowSum(series, WINDOW_DAYS).total : null;
  return { totalETH, deltaETH, windowDays: WINDOW_DAYS, protocols, scaffold: PROTOCOLS };
});
```

Keep `import { request } from "graphql-request";` at the top (still used by `fetchTotal`). Ensure `ProtocolConfig` and `ProtocolResult` remain imported from `./protocols`. `ProtocolResult.deltaETH` stays `bigint | null`; here it is always `null` (per-protocol window deltas now come from the series in `page.tsx`).

- [ ] **Step 3: Update `getDisplayProtocols` to stop reading per-protocol `deltaETH`**

In `getDisplayProtocols`, remove the `deltaWei`/`formattedDelta`/`weekSharePct` derivation from `p.deltaETH` (those are now range-specific and computed in `page.tsx`). Keep `DisplayProtocol` carrying the static fields only: change its type to drop `deltaWei`/`formattedDelta`/`weekSharePct`, and stop setting them. (Task 5/9 supply per-range deltas separately.)

- [ ] **Step 4: Update `delta.test.ts` — remove the deleted `computeDelta` tests**

In `web/src/lib/delta.test.ts`, delete the `import { computeDelta ... }` reference and the entire `describe("computeDelta", ...)` block. Keep the `formatSignedETH` and `weekShare` describe blocks (those functions still exist). Update the import line to `import { formatSignedETH, weekShare } from "./subgraph";`.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run` then `pnpm exec tsc --noEmit`
Expected: tests PASS (daily + remaining delta/share tests); `tsc` reports errors only in `page.tsx`/`OdometerStage.tsx`/`ProtocolList.tsx` that consume the removed `DisplayProtocol` fields — those are fixed in Tasks 5/9. If `tsc` is clean except those files, proceed.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/subgraph.ts web/src/lib/delta.test.ts
git commit -m "refactor(web): derive 7d delta from daily series, delete time-travel engine"
```

---

## Task 5: Build per-range chart points + delta strings in `page.tsx`

**Files:**
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/lib/daily.ts` (add display types + `toChartPoints` helper)
- Modify: `web/src/lib/daily.test.ts` (test `toChartPoints`)

- [ ] **Step 1: Add serializable display types + `toChartPoints` (TDD)**

Add to `web/src/lib/daily.test.ts`:

```ts
import { toChartPoints } from "./daily";

describe("toChartPoints", () => {
  it("converts wei day points to ordered ETH segments with labels", () => {
    const s = alignByDate({ a: [{ date: 20000, wei: wei(2n) }], b: [{ date: 20000, wei: wei(3n) }] });
    const pts = toChartPoints(s, [
      { id: "a", color: "#111" },
      { id: "b", color: "#222" },
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0].total).toBeCloseTo(5);
    expect(pts[0].values).toEqual([
      { id: "a", color: "#111", eth: 2 },
      { id: "b", color: "#222", eth: 3 },
    ]);
    expect(typeof pts[0].label).toBe("string");
  });
});
```

Add to `web/src/lib/daily.ts`:

```ts
const WEI = 10 ** 18;

export type ChartSegment = { id: string; color: string; eth: number };
export type ChartPoint = { label: string; values: ChartSegment[]; total: number };

export type StackOrder = { id: string; color: string }[];

function dayLabel(dayNumber: number): string {
  const d = new Date(dayNumber * 86400 * 1000);
  return d.toISOString().slice(5, 10); // MM-DD
}

export function toChartPoints(series: DailySeries, order: StackOrder): ChartPoint[] {
  return series.days.map((d) => {
    const values = order.map((o) => ({
      id: o.id,
      color: o.color,
      eth: Number(d.perProtocol[o.id] ?? 0n) / WEI,
    }));
    return { label: dayLabel(d.date), values, total: Number(d.total) / WEI };
  });
}
```

Run: `pnpm exec vitest run src/lib/daily.test.ts` → Expected: PASS.

- [ ] **Step 2: Add the `RangeKey` type + range config to `daily.ts`**

```ts
export type RangeKey = "7d" | "30d" | "90d" | "all";
export const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "last 7 days", days: 7 },
  { key: "30d", label: "last 30 days", days: 30 },
  { key: "90d", label: "last 90 days", days: 90 },
  { key: "all", label: "all time", days: Infinity },
];
```

- [ ] **Step 3: Build the per-range payload in `page.tsx`**

In `web/src/app/page.tsx`, replace the body up to the JSX with:

```tsx
import Methodology from "./components/Methodology";
import OdometerStage from "./components/OdometerStage";
import ProtocolList, { type ProtocolListItem } from "./components/ProtocolList";
import { formatETH, formatSignedETH, getDisplayProtocols, getTotals } from "@/lib/subgraph";
import { buildShareText } from "@/lib/share";
import {
  RANGES,
  cumulative,
  getDailySeries,
  lastN,
  toChartPoints,
  weeklyBuckets,
  windowSum,
  type ChartPoint,
  type RangeKey,
} from "@/lib/daily";

export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://shhheth.com";

export type RangeView = {
  key: RangeKey;
  label: string;
  mode: "bars" | "area";
  points: ChartPoint[];
  delta: { formatted: string; zero: boolean };
  byProtocol: Record<string, { formatted: string; zero: boolean; sharePct: number | null }>;
};

export default async function HomePage() {
  const [snapshot, series] = await Promise.all([getTotals(), getDailySeries()]);
  const formattedTotal = formatETH(snapshot.totalETH, 3);
  const isLive = snapshot.protocols.length > 0;
  const displayProtocols = getDisplayProtocols(snapshot, 3);

  const order = snapshot.scaffold
    .filter((s) => displayProtocols.some((d) => d.id === s.id))
    .map((s) => ({ id: s.id, color: s.color }));

  const allCumulative = weeklyBuckets(cumulative(series));

  const rangeViews: RangeView[] = RANGES.map((r) => {
    const isAll = r.key === "all";
    const points = isAll
      ? toChartPoints(allCumulative, order)
      : toChartPoints(lastN(series, r.days), order);
    const sum = isAll
      ? { total: snapshot.totalETH, perProtocol: Object.fromEntries(snapshot.protocols.map((p) => [p.id, p.totalETH])) }
      : windowSum(series, r.days);
    const byProtocol: RangeView["byProtocol"] = {};
    for (const o of order) {
      const w = sum.perProtocol[o.id] ?? 0n;
      byProtocol[o.id] = {
        formatted: formatSignedETH(w, 1),
        zero: w === 0n,
        sharePct: sum.total > 0n ? Number((w * 10000n) / sum.total) / 100 : null,
      };
    }
    return {
      key: r.key,
      label: r.label,
      mode: isAll ? "area" : "bars",
      points,
      delta: { formatted: formatSignedETH(sum.total, isAll ? 0 : 1), zero: sum.total === 0n },
      byProtocol,
    };
  });

  const topMover = displayProtocols
    .map((p) => ({ id: p.id, name: p.name }))
    .find((p) => {
      const b = rangeViews[0].byProtocol[p.id];
      return b && (b.sharePct ?? 0) >= 1;
    });
  const week = rangeViews[0];
  const shareText = buildShareText({
    total: formatETH(snapshot.totalETH, 0),
    delta: week.delta.zero ? null : week.delta.formatted,
    deltaZero: week.delta.zero,
    topMover:
      topMover && week.byProtocol[topMover.id]?.sharePct != null
        ? { name: topMover.name, sharePct: week.byProtocol[topMover.id].sharePct! }
        : null,
  });

  const scaffold: ProtocolListItem[] = snapshot.scaffold.map(
    ({ id, name, status, color }) => ({ id, name, status, color }),
  );
```

Then update the returned JSX `<OdometerStage … >` to pass the new props (replace the old `weekDelta`/`windowDays` props):

```tsx
      <OdometerStage
        formattedTotal={formattedTotal}
        isLive={isLive}
        protocols={displayProtocols}
        ranges={rangeViews}
        shareText={shareText}
        shareUrl={SITE_URL}
      >
        <ProtocolList scaffold={scaffold} live={displayProtocols} sparklines={sparklines} />
        <Methodology />
      </OdometerStage>
```

(`sparklines` is computed in Task 8, Step 2 — until then `tsc` flags this prop, which Task 8 resolves. `ProtocolList` does not need the range views; per-card deltas are not shown, only the sparkline.)

- [ ] **Step 4: Typecheck (expect component prop errors only)**

Run: `pnpm exec tsc --noEmit`
Expected: errors only in `OdometerStage.tsx` / `ProtocolList.tsx` (new props not yet accepted) — fixed in Tasks 8–9.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/daily.ts web/src/lib/daily.test.ts web/src/app/page.tsx
git commit -m "feat(web): per-range chart points + delta strings in page"
```

---

## Task 6: RangeToggle component

**Files:**
- Create: `web/src/app/components/RangeToggle.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Create the component**

`web/src/app/components/RangeToggle.tsx`:

```tsx
"use client";

import { memo } from "react";
import type { RangeKey } from "@/lib/daily";

type Props = {
  ranges: { key: RangeKey; label: string }[];
  active: RangeKey;
  onChange: (key: RangeKey) => void;
};

const SHORT: Record<RangeKey, string> = { "7d": "7D", "30d": "30D", "90d": "90D", all: "ALL" };

function RangeToggle({ ranges, active, onChange }: Props) {
  return (
    <div className="range-toggle" role="tablist" aria-label="Time range">
      {ranges.map((r) => (
        <button
          key={r.key}
          type="button"
          role="tab"
          aria-selected={r.key === active}
          className={`range-toggle-btn${r.key === active ? " is-active" : ""}`}
          onClick={() => onChange(r.key)}
        >
          {SHORT[r.key]}
        </button>
      ))}
    </div>
  );
}

export default memo(RangeToggle);
```

- [ ] **Step 2: Add styles to `globals.css`**

Append near the `.screen-delta` rules:

```css
.range-toggle {
  pointer-events: auto;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(10, 13, 18, 0.05);
  border: 1px solid rgba(10, 13, 18, 0.12);
}
.range-toggle-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  font-family: var(--mono);
  font-size: clamp(0.56rem, 0.72vw, 0.7rem);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: rgba(10, 13, 18, 0.5);
  transition: background 0.15s ease, color 0.15s ease;
}
.range-toggle-btn.is-active {
  background: var(--ink);
  color: var(--paper);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/components/RangeToggle.tsx web/src/app/globals.css
git commit -m "feat(web): RangeToggle component"
```

---

## Task 7: InflowChart component (stacked SVG)

**Files:**
- Create: `web/src/app/components/InflowChart.tsx`
- Modify: `web/src/app/globals.css`

Renders a 0-anchored stacked chart in a `viewBox` of `0 0 100 H` (percent-width, fixed height units), so it scales fluidly. `bars` mode = one stacked column per point; `area` mode = stacked area polygons per protocol.

- [ ] **Step 1: Create the component**

`web/src/app/components/InflowChart.tsx`:

```tsx
"use client";

import { memo, useMemo, useState } from "react";
import type { ChartPoint } from "@/lib/daily";

type Props = { points: ChartPoint[]; mode: "bars" | "area"; order: { id: string; color: string }[] };

const H = 60; // viewBox height units

function InflowChart({ points, mode, order }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(
    () => Math.max(1e-9, ...points.map((p) => p.total)),
    [points],
  );

  if (points.length === 0) {
    return <div className="inflow-chart inflow-chart-empty" aria-hidden="true" />;
  }

  const n = points.length;
  const colW = 100 / n;
  const y = (eth: number) => H - (eth / max) * H;

  return (
    <div className="inflow-chart">
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label="Shielded inflow over time">
        {mode === "bars"
          ? points.map((p, i) => {
              const x = i * colW;
              let acc = 0;
              return (
                <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  <rect x={x} y={0} width={colW} height={H} fill="transparent" />
                  {p.values.map((v) => {
                    const h = (v.eth / max) * H;
                    const yy = H - acc - h;
                    acc += h;
                    return (
                      <rect
                        key={v.id}
                        x={x + colW * 0.12}
                        y={yy}
                        width={colW * 0.76}
                        height={Math.max(0, h)}
                        fill={v.color}
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                    );
                  })}
                </g>
              );
            })
          : order.map((o) => {
              // stacked area: baseline accumulates across protocols
              const top: string[] = [];
              const bottom: string[] = [];
              points.forEach((p, i) => {
                const x = (i / (n - 1 || 1)) * 100;
                const below = p.values
                  .slice(0, p.values.findIndex((v) => v.id === o.id))
                  .reduce((s, v) => s + v.eth, 0);
                const here = p.values.find((v) => v.id === o.id)?.eth ?? 0;
                top.push(`${x},${y(below + here)}`);
                bottom.push(`${x},${y(below)}`);
              });
              return (
                <polygon
                  key={o.id}
                  points={[...top, ...bottom.reverse()].join(" ")}
                  fill={o.color}
                  opacity={0.9}
                />
              );
            })}
      </svg>
      <p className="inflow-chart-caption" aria-live="polite">
        {hover !== null ? `${points[hover].label} · ${points[hover].total.toFixed(1)} ETH` : " "}
      </p>
    </div>
  );
}

export default memo(InflowChart);
```

- [ ] **Step 2: Add styles to `globals.css`**

```css
.inflow-chart {
  pointer-events: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.inflow-chart svg {
  width: 100%;
  height: clamp(48px, 10vh, 96px);
  display: block;
}
.inflow-chart-empty svg { display: none; }
.inflow-chart-caption {
  margin: 0;
  font-family: var(--mono);
  font-size: clamp(0.56rem, 0.7vw, 0.68rem);
  letter-spacing: 0.1em;
  color: rgba(10, 13, 18, 0.5);
  text-align: center;
  min-height: 1em;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/components/InflowChart.tsx web/src/app/globals.css
git commit -m "feat(web): InflowChart stacked SVG (bars + area)"
```

---

## Task 8: Sparkline component + ProtocolList integration

**Files:**
- Create: `web/src/app/components/Sparkline.tsx`
- Modify: `web/src/app/components/ProtocolList.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Create the Sparkline (pure, no "use client" needed)**

`web/src/app/components/Sparkline.tsx`:

```tsx
import { memo } from "react";

type Props = { values: number[]; color: string };

function Sparkline({ values, color }: Props) {
  if (values.length < 2) return <svg className="sparkline" aria-hidden="true" />;
  const max = Math.max(1e-9, ...values);
  const n = values.length;
  const pts = values
    .map((v, i) => `${(i / (n - 1)) * 100},${20 - (v / max) * 20}`)
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default memo(Sparkline);
```

- [ ] **Step 2: Pass per-protocol recent series into `ProtocolList`**

In `page.tsx`, after `order` is computed, build a 30-day per-protocol number series and pass it:

```tsx
import { lastN } from "@/lib/daily"; // already imported
const spark30 = lastN(series, 30);
const sparklines: Record<string, number[]> = {};
for (const o of order) {
  sparklines[o.id] = spark30.days.map((d) => Number(d.perProtocol[o.id] ?? 0n) / 1e18);
}
```

Pass `sparklines={sparklines}` to `<ProtocolList … />`.

- [ ] **Step 3: Render the sparkline in each card**

In `web/src/app/components/ProtocolList.tsx`: add `sparklines: Record<string, number[]>` and `ranges: RangeView[]` to `Props` (import `RangeView` from `@/app/page` is circular — instead define the per-card delta inline using `ranges` only if needed; for this task pass just `sparklines`). Import `Sparkline`, and inside the `protocol-card-data` block (for live rows) add:

```tsx
<Sparkline values={sparklines[row.id] ?? []} color={row.color} />
```

Update the `Props` type: `sparklines: Record<string, number[]>;` and accept it in the function signature. Remove the unused `formatETH`/delta fields if `tsc` flags them.

- [ ] **Step 4: Add styles**

```css
.sparkline {
  width: 100%;
  height: 18px;
  margin-top: 0.4rem;
  opacity: 0.85;
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from these files.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/components/Sparkline.tsx web/src/app/components/ProtocolList.tsx web/src/app/page.tsx web/src/app/globals.css
git commit -m "feat(web): per-protocol sparklines in breakdown cards"
```

---

## Task 9: Wire OdometerStage (range state, chart, range-aware delta)

**Files:**
- Modify: `web/src/app/components/OdometerStage.tsx`

- [ ] **Step 1: Update props + add range state**

Replace the `weekDelta`/`windowDays` props with `ranges: RangeView[]`. Add at the top of the component:

```tsx
import { useState } from "react";
import RangeToggle from "./RangeToggle";
import InflowChart from "./InflowChart";
import type { RangeView } from "../page";
import type { RangeKey } from "@/lib/daily";

// in Props:
//   ranges: RangeView[];
//   shareText: string;
//   shareUrl: string;

const [activeRange, setActiveRange] = useState<RangeKey>("7d");
const view = ranges.find((r) => r.key === activeRange) ?? ranges[0];
const order = ranges[0].points[0]?.values.map((v) => ({ id: v.id, color: v.color })) ?? [];
```

- [ ] **Step 2: Make the delta line range-aware**

Replace the `deltaView` `useMemo` so it reads `view`:

```tsx
const deltaView = useMemo(() => {
  if (hovered) {
    const b = view.byProtocol[hovered.id];
    if (!b) return null;
    return {
      flat: b.zero,
      primary: b.zero ? "flat" : `${b.formatted} ETH`,
      secondary: !b.zero && b.sharePct !== null ? `${b.sharePct.toFixed(0)}% of ${view.label}` : view.label,
    };
  }
  return {
    flat: view.delta.zero,
    primary: view.delta.zero ? "flat" : `${view.delta.formatted} ETH`,
    secondary: view.label,
  };
}, [hovered, view]);
```

(The `hovered` value comes from the existing breakdown-segment hover state; `DisplayProtocol` no longer carries `formattedDelta`/`weekSharePct`, so those lookups are replaced by `view.byProtocol`.)

- [ ] **Step 3: Render toggle + chart under the breakdown**

Inside `screen-content`, after the `breakdown` block, add:

```tsx
<div className="screen-chart">
  <RangeToggle
    ranges={ranges.map((r) => ({ key: r.key, label: r.label }))}
    active={activeRange}
    onChange={setActiveRange}
  />
  <InflowChart points={view.points} mode={view.mode} order={order} />
</div>
```

- [ ] **Step 4: Add minimal layout style to `globals.css`**

```css
.screen-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.3rem;
}
```

- [ ] **Step 5: Typecheck + tests**

Run: `pnpm exec tsc --noEmit` then `pnpm exec vitest run`
Expected: `tsc` clean across the repo; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/components/OdometerStage.tsx web/src/app/globals.css
git commit -m "feat(web): unified range toggle + inflow chart in the screen"
```

---

## Task 10: Verify end-to-end + preview deploy

**Files:** none (verification only)

- [ ] **Step 1: Full check**

Run from `web/`:
```bash
pnpm exec tsc --noEmit && pnpm exec eslint src && pnpm exec vitest run && pnpm build
```
Expected: all green; build prerenders `/` statically.

- [ ] **Step 2: Confirm the chart rendered into the prerendered HTML**

```bash
grep -oE "range-toggle|inflow-chart|sparkline" web/.next/server/app/index.html | sort -u
```
Expected: all three class names present.

- [ ] **Step 3: Deploy a preview**

```bash
cd web && vercel deploy --yes
```
Expected: a preview URL. Open it, toggle `7d/30d/90d/All`, hover bars + protocol segments, confirm sparklines render in the cards. Do NOT promote to production until the user reviews.

- [ ] **Step 4: Report the preview URL to the user for review.**

---

## Self-review notes (author)

- **Spec coverage:** unified toggle (Tasks 5,6,9) ✓; stacked bars + weekly area (Tasks 5,7) ✓; sparklines (Task 8) ✓; delta rewired onto series, time-travel deleted, OG/share untouched via `getTotals` 7d delta (Task 4) ✓; pure transforms unit-tested (Tasks 2,5) ✓; 24h dropped, ranges 7d/30d/90d/All (Task 5 `RANGES`) ✓; zero-fill/pagination/edge cases (Tasks 2,3) ✓.
- **Serialization:** all client props are `number`/`string` (Tasks 5,8); `daily.ts` keeps `bigint` server-side.
- **Type consistency:** `RangeView` defined in `page.tsx` and imported by `OdometerStage`; `ChartPoint`/`RangeKey`/`RANGES` from `daily.ts`; `DisplayProtocol` slimmed in Task 4 and consumers updated in Tasks 8–9.
