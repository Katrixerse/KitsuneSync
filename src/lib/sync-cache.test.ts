import { describe, expect, it } from "vitest";
import { LIBRARY_CACHE_MAX, LIBRARY_CACHE_TTL_MS, libraryCache, TtlCache } from "./sync-cache";

function clock(start = 0) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe("TtlCache", () => {
  it("returns a value until it expires", () => {
    const c = clock();
    const cache = new TtlCache<string>(1000, 10, c.now);
    cache.set("a", "A");
    c.tick(999);
    expect(cache.get("a")).toBe("A");
    c.tick(1);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("refreshing a key restarts its clock", () => {
    const c = clock();
    const cache = new TtlCache<string>(1000, 10, c.now);
    cache.set("a", "A");
    c.tick(800);
    cache.set("a", "A2");
    c.tick(800);
    expect(cache.get("a")).toBe("A2");
  });

  it("drops the oldest entries past the size cap", () => {
    const c = clock();
    const cache = new TtlCache<number>(1000, 2, c.now);
    cache.set("a", 1);
    c.tick(1);
    cache.set("b", 2);
    c.tick(1);
    cache.set("c", 3);
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("evicts expired entries on access and can be cleared", () => {
    const c = clock();
    const cache = new TtlCache<number>(1000, 10, c.now);
    cache.set("a", 1);
    c.tick(500);
    cache.set("b", 2);
    c.tick(600);
    expect(cache.get("b")).toBe(2);
    expect(cache.size).toBe(1); // "a" went while looking up "b"
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("ships a one-minute cache for AniList libraries", () => {
    expect(LIBRARY_CACHE_TTL_MS).toBe(60_000);
    expect(LIBRARY_CACHE_MAX).toBe(500);
    expect(libraryCache).toBeInstanceOf(TtlCache);
  });
});
