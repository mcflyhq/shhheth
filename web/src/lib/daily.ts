import { cache } from "react";
import { request } from "graphql-request";
import { PROTOCOLS, type ProtocolConfig } from "./protocols";

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

export type RangeKey = "7d" | "30d" | "90d" | "all";
export const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "last 7 days", days: 7 },
  { key: "30d", label: "last 30 days", days: 30 },
  { key: "90d", label: "last 90 days", days: 90 },
  { key: "all", label: "all time", days: Infinity },
];

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
