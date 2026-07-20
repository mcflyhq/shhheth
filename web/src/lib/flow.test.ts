import { describe, expect, it } from "vitest";
import {
  FLOW_LIST_PAGE,
  addressColor,
  formatCount,
  formatEthWei,
  isFlowPool,
  safeBigInt,
  shortAddr,
} from "./flow";

describe("flow helpers", () => {
  it("shortens addresses", () => {
    expect(shortAddr("0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936")).toBe(
      "0x47ce…936",
    );
  });

  it("hardens shortAddr on empty/invalid input", () => {
    expect(shortAddr("")).toBe("0x…");
    expect(shortAddr("0x")).toBe("0x");
    expect(shortAddr("abc")).toBe("0xabc");
  });

  it("formats wei as eth", () => {
    expect(formatEthWei(15n * 10n ** 17n, 1)).toBe("1.5");
    expect(formatEthWei(0n, 1)).toBe("0.0");
    expect(formatEthWei(118266n * 10n ** 17n, 1)).toBe("11,826.6");
    expect(formatEthWei(132621n * 10n ** 17n, 1)).toBe("13,262.1");
  });

  it("parses wei strings safely", () => {
    expect(safeBigInt("100")).toBe(100n);
    expect(safeBigInt("nope")).toBe(0n);
    expect(safeBigInt(null)).toBe(0n);
    expect(safeBigInt(12n)).toBe(12n);
  });

  it("validates pool labels", () => {
    expect(isFlowPool("1")).toBe(true);
    expect(isFlowPool("2")).toBe(false);
  });

  it("maps addresses to stable coinjoin-style HSL hues", () => {
    const a = addressColor("0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936");
    const b = addressColor("0x47CE0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936");
    const c = addressColor("0x0000000000000000000000000000000000000001");
    expect(a).toMatch(/^hsl\(/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("formats counts with truncation mark", () => {
    expect(formatCount(253, false)).toBe("253");
    expect(formatCount(200, true)).toBe("200+");
    expect(formatCount(1200, false)).toBe("1.2k");
  });

  it("pages list rows", () => {
    expect(FLOW_LIST_PAGE).toBeGreaterThan(0);
  });
});
