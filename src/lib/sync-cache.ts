import type { Library } from "./anilist/types";

/**
 * A small cache with a time to live and a size cap. Expired entries are
 * dropped on access and the oldest go first when the cap is reached, so it
 * can't grow without bound. The time source can be injected in tests.
 */
export class TtlCache<T> {
  /** Ordered by expiry, oldest first, because every entry gets the same TTL. */
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): T | undefined {
    this.evictExpired();
    return this.entries.get(key)?.value;
  }

  set(key: string, value: T) {
    // Re-insert so a refreshed key moves to the end of the expiry order.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    this.evictExpired();
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }

  private evictExpired() {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) break;
      this.entries.delete(key);
    }
  }
}

export const LIBRARY_CACHE_TTL_MS = 60_000;
export const LIBRARY_CACHE_MAX = 500;

/**
 * Recent AniList responses by lowercase username, so repeated syncs of one
 * user (from one browser or many) hit AniList once a minute. A cached
 * library keeps the syncedAt of the fetch that produced it.
 *
 * Lives in this process only: fine for the single-container docker compose
 * deploy, while a multi-instance deploy would need a shared store.
 */
export const libraryCache = new TtlCache<Library>(LIBRARY_CACHE_TTL_MS, LIBRARY_CACHE_MAX);
