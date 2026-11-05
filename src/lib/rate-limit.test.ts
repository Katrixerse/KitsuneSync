import { describe, expect, it } from "vitest";
import {
  LINK_ATTEMPT_LIMIT,
  LINK_ATTEMPT_WINDOW_MS,
  linkLimiter,
  RateLimiter,
  SYNC_LIMIT,
  SYNC_WINDOW_MS,
  syncLimiter,
} from "./rate-limit";

function clock(start = 0) {
  let t = start;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  it("allows up to the limit in a window, then refuses", () => {
    const c = clock();
    const limiter = new RateLimiter(3, 1000, 100, c.now);
    expect([limiter.allow("a"), limiter.allow("a"), limiter.allow("a")]).toEqual([true, true, true]);
    expect(limiter.allow("a")).toBe(false);
    // Another key has its own budget.
    expect(limiter.allow("b")).toBe(true);
  });

  it("slides: hits fall out of the window one by one", () => {
    const c = clock();
    const limiter = new RateLimiter(2, 1000, 100, c.now);
    limiter.allow("a");
    c.tick(600);
    limiter.allow("a");
    expect(limiter.allow("a")).toBe(false);
    c.tick(401); // the first hit is now older than the window
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  it("refused hits don't extend the block", () => {
    const c = clock();
    const limiter = new RateLimiter(1, 1000, 100, c.now);
    limiter.allow("a");
    c.tick(900);
    expect(limiter.allow("a")).toBe(false);
    c.tick(101);
    expect(limiter.allow("a")).toBe(true);
  });

  it("forgets idle keys and caps how many it remembers", () => {
    const c = clock();
    const limiter = new RateLimiter(5, 1000, 3, c.now);
    limiter.allow("a");
    limiter.allow("b");
    limiter.allow("c");
    expect(limiter.size).toBe(3);
    limiter.allow("d"); // over the cap: the least recently hit key goes
    expect(limiter.size).toBe(3);
    expect(limiter.allow("a")).toBe(true); // "a" was forgotten, so it starts afresh
    c.tick(1001);
    limiter.allow("e"); // everything older than the window is dropped
    expect(limiter.size).toBe(1);
    limiter.clear();
    expect(limiter.size).toBe(0);
  });

  it("ships a limiter for syncs", () => {
    expect(SYNC_LIMIT).toBe(10);
    expect(SYNC_WINDOW_MS).toBe(60_000);
    expect(syncLimiter).toBeInstanceOf(RateLimiter);
  });

  it("ships a separate limiter for link-code attempts", () => {
    expect(LINK_ATTEMPT_LIMIT).toBe(10);
    expect(LINK_ATTEMPT_WINDOW_MS).toBe(60_000);
    expect(linkLimiter).toBeInstanceOf(RateLimiter);
    expect(linkLimiter).not.toBe(syncLimiter);
  });
});
