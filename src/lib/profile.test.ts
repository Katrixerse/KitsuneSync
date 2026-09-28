import { describe, expect, it } from "vitest";
import { demoLibrary, demoShelf } from "./demo";
import {
  assignRole,
  cardSerial,
  catCommentary,
  computeLevel,
  computeStats,
  daysWatched,
} from "./profile";
import { shelfStats } from "./shelf";

const library = demoLibrary(new Date("2026-06-01T00:00:00Z"));
const stats = computeStats(library);

describe("computeStats", () => {
  it("ignores planning entries for counts and taste", () => {
    expect(stats.animeCount).toBe(18);
    expect(stats.mangaCount).toBe(12);
    expect(stats.planning).toBe(6);
  });

  it("totals episodes and watch time using episode duration", () => {
    const expectedEpisodes = library.anime
      .filter((e) => e.status !== "PLANNING")
      .reduce((n, e) => n + e.progress, 0);
    expect(stats.episodes).toBe(expectedEpisodes);
    expect(daysWatched(stats)).toBeGreaterThan(4);
  });

  it("ranks Sci-Fi as the demo user's top genre", () => {
    expect(stats.topGenres[0].genre).toBe("Sci-Fi");
    expect(assignRole(stats).name).toBe("Netrunner");
  });

  it("measures disagreement with the community", () => {
    expect(stats.contrarian).toBeGreaterThan(0);
    expect(stats.scoreDelta).not.toBeNull();
  });

  it("handles an empty library", () => {
    const empty = computeStats({ anime: [], manga: [] });
    expect(empty.meanScore).toBeNull();
    expect(empty.topGenres).toEqual([]);
    expect(assignRole(empty).name).toBe("Drifter");
    expect(computeLevel(empty).level).toBe(1);
  });
});

describe("identity", () => {
  it("produces a stable card serial", () => {
    expect(cardSerial(1, "a")).toBe(cardSerial(1, "a"));
    expect(cardSerial(1, "a")).not.toBe(cardSerial(2, "a"));
    expect(cardSerial(1, "a")).toMatch(/^KS-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("caps level at 99", () => {
    const huge = { ...stats, episodes: 10_000_000 };
    expect(computeLevel(huge)).toMatchObject({ level: 99, rank: "Myth", progress: 1 });
  });
});

describe("catCommentary", () => {
  const shelf = shelfStats(demoShelf(library));

  it("is deterministic per seed and respects the limit", () => {
    const a = catCommentary(stats, shelf, "NekoRunner", 3);
    expect(a).toHaveLength(3);
    expect(catCommentary(stats, shelf, "NekoRunner", 3)).toEqual(a);
  });

  it("comments on shelf gaps and genre", () => {
    const ids = catCommentary(stats, shelf, "x", 20).map((l) => l.id);
    expect(ids).toContain("genre");
    expect(ids).toContain("gaps");
    expect(ids).toContain("complete-set");
    expect(ids).not.toContain("no-shelf");
  });

  it("falls asleep on an empty profile", () => {
    const empty = computeStats({ anime: [], manga: [] });
    const [line] = catCommentary(empty, { series: 0, volumes: 0, complete: 0, gaps: 0 }, "x");
    expect(line).toMatchObject({ id: "empty", mood: "sleepy" });
  });
});
