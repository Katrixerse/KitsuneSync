import { describe, expect, it } from "vitest";
import {
  displayedVolumeCount,
  formatRanges,
  gapVolumes,
  isComplete,
  nextVolumes,
  ownFirst,
  parseRanges,
  setTotalVolumes,
  shelfStats,
  toggleVolume,
  type ShelfSeries,
} from "./shelf";

function series(overrides: Partial<ShelfSeries> = {}): ShelfSeries {
  return {
    mediaId: 1,
    title: "Test",
    cover: null,
    color: null,
    siteUrl: null,
    totalVolumes: 10,
    owned: [],
    edition: "standard",
    ongoing: false,
    addedAt: "2026-01-01T00:00:00.000Z",
    notes: "",
    ...overrides,
  };
}

describe("ranges", () => {
  it("formats consecutive runs", () => {
    expect(formatRanges([7, 1, 2, 3, 5, 8, 3])).toBe("1–3, 5, 7–8");
    expect(formatRanges([])).toBe("");
  });

  it("parses mixed input, ignoring junk and clamping", () => {
    expect(parseRanges("1-3, 5 7–8 x 0 4-2")).toEqual([1, 2, 3, 4, 5, 7, 8]);
    expect(parseRanges("199-500")).toEqual([199, 200]);
  });

  it("round-trips", () => {
    const vols = [1, 2, 3, 6, 9, 10, 11];
    expect(parseRanges(formatRanges(vols))).toEqual(vols);
  });
});

describe("volumes", () => {
  it("toggles volumes on and off, keeping them sorted", () => {
    let s = series({ owned: [3] });
    s = toggleVolume(s, 1);
    expect(s.owned).toEqual([1, 3]);
    s = toggleVolume(s, 3);
    expect(s.owned).toEqual([1]);
  });

  it("finds gaps below the highest owned volume", () => {
    expect(gapVolumes(series({ owned: [1, 2, 5, 7] }))).toEqual([3, 4, 6]);
    expect(gapVolumes(series({ owned: [] }))).toEqual([]);
  });

  it("lists released volumes after the highest owned one", () => {
    expect(nextVolumes(series({ owned: [1, 2], totalVolumes: 4 }))).toEqual([3, 4]);
    expect(nextVolumes(series({ owned: [1, 2], totalVolumes: null }))).toEqual([]);
  });

  it("draws one extra slot when the total is unknown", () => {
    expect(displayedVolumeCount(series({ owned: [1, 4], totalVolumes: null }))).toBe(5);
    expect(displayedVolumeCount(series({ owned: [1, 12], totalVolumes: 10 }))).toBe(12);
  });

  it("only calls finished, gapless, full series complete", () => {
    expect(isComplete(ownFirst(series({ totalVolumes: 3 }), 3))).toBe(true);
    expect(isComplete(ownFirst(series({ totalVolumes: 3, ongoing: true }), 3))).toBe(false);
    expect(isComplete(series({ totalVolumes: 3, owned: [1, 3] }))).toBe(false);
    expect(isComplete(ownFirst(series({ totalVolumes: null }), 3))).toBe(false);
  });

  it("sanitizes total volumes", () => {
    expect(setTotalVolumes(series(), 0).totalVolumes).toBeNull();
    expect(setTotalVolumes(series(), 12.7).totalVolumes).toBe(12);
    expect(setTotalVolumes(series(), Number.NaN).totalVolumes).toBeNull();
  });

  it("summarizes the shelf", () => {
    const stats = shelfStats({
      1: ownFirst(series({ mediaId: 1, totalVolumes: 2 }), 2),
      2: series({ mediaId: 2, owned: [1, 4] }),
    });
    expect(stats).toEqual({ series: 2, volumes: 4, complete: 1, gaps: 2 });
  });
});
