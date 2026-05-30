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
