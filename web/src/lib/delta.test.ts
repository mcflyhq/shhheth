import { describe, expect, it } from "vitest";

import { formatSignedETH, weekShare } from "./subgraph";

const ETH = (n: bigint) => n * 10n ** 18n;

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
