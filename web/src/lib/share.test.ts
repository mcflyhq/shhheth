import { describe, expect, it } from "vitest";

import { buildShareText } from "./share";

describe("buildShareText", () => {
  it("includes the week line with the top mover's share", () => {
    const text = buildShareText({
      total: "6,050,014",
      delta: "+13,938",
      deltaZero: false,
      topMover: { name: "Tornado Cash", sharePct: 85 },
    });
    expect(text).toContain("6,050,014 ETH has been shielded");
    expect(text).toContain("This week: +13,938 ETH, Tornado Cash driving 85% of it.");
  });

  it("omits the mover clause when no protocol dominates", () => {
    const text = buildShareText({
      total: "6,050,014",
      delta: "+13,938",
      deltaZero: false,
      topMover: null,
    });
    expect(text).toContain("This week: +13,938 ETH.");
  });

  it("renders a flat week", () => {
    const text = buildShareText({
      total: "6,050,014",
      delta: "0",
      deltaZero: true,
      topMover: null,
    });
    expect(text).toContain("This week: flat.");
  });

  it("drops the week line entirely when delta is unknown", () => {
    const text = buildShareText({
      total: "6,050,014",
      delta: null,
      deltaZero: false,
      topMover: null,
    });
    expect(text).not.toContain("This week");
  });
});
