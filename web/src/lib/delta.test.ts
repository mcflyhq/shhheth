import { describe, expect, it } from "vitest";

import { computeDelta, formatSignedETH, weekShare } from "./subgraph";

const ETH = (n: bigint) => n * 10n ** 18n;

describe("computeDelta", () => {
  it("returns the rise between baseline and current", () => {
    expect(computeDelta(ETH(120n), ETH(100n))).toBe(ETH(20n));
  });

  it("treats a null baseline as unknown", () => {
    expect(computeDelta(ETH(120n), null)).toBeNull();
  });

  it("counts the whole total when the baseline is zero (new protocol)", () => {
    expect(computeDelta(ETH(50n), 0n)).toBe(ETH(50n));
  });

  it("clamps a negative movement to zero (reorg/glitch)", () => {
    expect(computeDelta(ETH(90n), ETH(100n))).toBe(0n);
  });
});

describe("formatSignedETH", () => {
  it("prefixes a positive delta and groups thousands", () => {
    expect(formatSignedETH(ETH(18400n), 1)).toBe("+18,400.0");
  });

  it("renders an exact zero as plain '0'", () => {
    expect(formatSignedETH(0n, 1)).toBe("0");
  });

  it("prefixes a negative delta", () => {
    expect(formatSignedETH(-ETH(5n), 1)).toBe("-5.0");
  });
});

describe("weekShare", () => {
  it("returns the protocol's percentage of the window inflow", () => {
    expect(weekShare(ETH(60n), ETH(100n))).toBe(60);
  });

  it("guards against a zero aggregate", () => {
    expect(weekShare(ETH(10n), 0n)).toBeNull();
  });
});
