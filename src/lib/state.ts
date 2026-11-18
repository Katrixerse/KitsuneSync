import type { Library } from "./anilist/types";
import { mergeReleases, refreshSeries, type ReleaseAlert } from "./releases";
import type { Shelf } from "./shelf";
import type { WishlistState } from "./wishlist";

/**
 * Everything KitsuneSync keeps for one browser profile. AniList stays the
 * source of truth for lists; the shelf, wishlist and release alerts are ours.
 * The same shape lives in Postgres (see lib/db) and in the client store (see
 * lib/store).
 */
export interface KitsuneState {
  version: 1;
  library: Library | null;
  shelf: Shelf;
  wishlist: WishlistState;
  /** Volumes that came out for shelved series since an earlier sync, until dismissed. */
  releases: ReleaseAlert[];
}

export const EMPTY_STATE: KitsuneState = {
  version: 1,
  library: null,
  shelf: {},
  wishlist: { manual: [], dismissed: [] },
  releases: [],
};

/**
 * Applies a fresh AniList sync. Switching from the demo to a real account
 * drops the demo shelf, wishlist and alerts; otherwise shelf metadata is
 * refreshed and new releases join the alerts still showing. Pure, so the
 * client and the server reach the same state from the same sync.
 */
export function applySync(prev: KitsuneState, library: Library): KitsuneState {
  const leavingDemo = prev.library?.demo && !library.demo;
  if (leavingDemo) return { ...prev, library, shelf: {}, wishlist: EMPTY_STATE.wishlist, releases: EMPTY_STATE.releases };
  const { shelf, releases } = refreshShelf(prev.shelf, library);
  return { ...prev, library, shelf, releases: mergeReleases(prev.releases, releases) };
}

/**
 * Updates shelf metadata (covers, titles, totals) from a fresh sync without
 * touching owned volumes, and reports the volumes AniList added since the
 * last sync (see lib/releases.ts). Series not in the sync stay as they are.
 */
export function refreshShelf(shelf: Shelf, library: Library): { shelf: Shelf; releases: ReleaseAlert[] } {
  const byId = new Map(library.manga.map((e) => [e.media.id, e.media]));
  const next: Shelf = {};
  const releases: ReleaseAlert[] = [];
  for (const series of Object.values(shelf)) {
    const media = byId.get(series.mediaId);
    if (!media) {
      next[series.mediaId] = series;
      continue;
    }
    const refreshed = refreshSeries(series, media, library.syncedAt);
    next[series.mediaId] = refreshed.series;
    if (refreshed.release) releases.push(refreshed.release);
  }
  return { shelf: next, releases };
}
