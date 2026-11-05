/**
 * A sliding-window rate limiter: at most `limit` hits per key in any
 * `windowMs` span. Pure and in-memory, so the time source can be injected in
 * tests, and the key set is capped so it can't grow without bound.
 *
 * Counts live in this process only. That is fine for the single-container
 * docker compose deploy; a multi-instance deploy would need a shared store.
 */
export class RateLimiter {
  /** Hit times per key, ascending. The map itself is ordered by newest hit, oldest first. */
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Records a hit for `key` and reports whether it is within the limit. Refused hits don't count. */
  allow(key: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.limit) {
      // Keep the pruned list in place, so the map's order still follows the newest hit.
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    // Re-insert so this key moves to the end and the map stays ordered by newest hit.
    this.hits.delete(key);
    this.hits.set(key, recent);
    this.prune(now);
    return true;
  }

  /** Number of keys currently remembered. */
  get size(): number {
    return this.hits.size;
  }

  clear() {
    this.hits.clear();
  }

  /** Forgets keys with no hit in the window, then the least recently hit ones past `maxKeys`. */
  private prune(now: number) {
    for (const [key, times] of this.hits) {
      // Ordered by newest hit, so the first key still in the window means the rest are too.
      if (times[times.length - 1] > now - this.windowMs) break;
      this.hits.delete(key);
    }
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(key);
    }
  }
}

/** Syncs allowed per profile (or per IP before a profile exists) in one window. */
export const SYNC_LIMIT = 10;
export const SYNC_WINDOW_MS = 60_000;

/** Limits syncLibraryAction, the one action that calls out to AniList. */
export const syncLimiter = new RateLimiter(SYNC_LIMIT, SYNC_WINDOW_MS);

/** Link-code redemptions allowed per profile (or per IP) in one window, so codes can't be guessed. */
export const LINK_ATTEMPT_LIMIT = 10;
export const LINK_ATTEMPT_WINDOW_MS = 60_000;

/** Limits redeemLinkCodeAction. Every attempt counts, right or wrong. */
export const linkLimiter = new RateLimiter(LINK_ATTEMPT_LIMIT, LINK_ATTEMPT_WINDOW_MS);
