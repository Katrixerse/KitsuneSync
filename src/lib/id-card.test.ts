import { describe, expect, it } from "vitest";
import { BARCODE_WIDTH, barcodeBars, issuedOn } from "./id-card";

describe("barcodeBars", () => {
  const bars = barcodeBars("KS-1A2B-3C4D");

  it("is stable for a seed and differs between seeds", () => {
    expect(barcodeBars("KS-1A2B-3C4D")).toEqual(bars);
    expect(barcodeBars("KS-0000-0000")).not.toEqual(bars);
  });

  it("fills the width with 1–3 unit bars and gaps, left to right", () => {
    expect(bars.length).toBeGreaterThan(20);
    expect(bars[0].x).toBe(0);
    expect(bars.at(-1)!.x).toBeLessThan(BARCODE_WIDTH);
    for (let i = 0; i < bars.length; i++) {
      expect(bars[i].w).toBeGreaterThanOrEqual(1);
      expect(bars[i].w).toBeLessThanOrEqual(3);
      if (i > 0) {
        const gap = bars[i].x - (bars[i - 1].x + bars[i - 1].w);
        expect(gap).toBeGreaterThanOrEqual(1);
        expect(gap).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("issuedOn", () => {
  it("prints the sync date with dots, in UTC", () => {
    expect(issuedOn("2026-06-01T23:59:59.000Z")).toBe("2026.06.01");
    expect(issuedOn("2026-06-01T23:59:59-05:00")).toBe("2026.06.02");
  });
});
