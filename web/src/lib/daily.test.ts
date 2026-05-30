import { describe, expect, it } from "vitest";
import {
  alignByDate,
  windowSum,
  cumulative,
  weeklyBuckets,
  lastN,
  toChartPoints,
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
