import type { Library } from "./anilist/types";
import type { Shelf } from "./shelf";
import type { WishlistState } from "./wishlist";

/**
 * Everything KitsuneSync keeps for one browser profile. AniList stays the
 * source of truth for lists; the shelf and wishlist are ours. The same shape
 * lives in Postgres (see lib/db) and in the client store (see lib/store).
 */
export interface KitsuneState {
  version: 1;
  library: Library | null;
  shelf: Shelf;
  wishlist: WishlistState;
}

export const EMPTY_STATE: KitsuneState = {
  version: 1,
  library: null,
  shelf: {},
  wishlist: { manual: [], dismissed: [] },
};

/**
 * Applies a fresh AniList sync. Switching from the demo to a real account
 * drops the demo shelf and wishlist; otherwise shelf metadata is refreshed.
 */
export function applySync(prev: KitsuneState, library: Library): KitsuneState {
  const leavingDemo = prev.library?.demo && !library.demo;
  return {
    ...prev,
    library,
    shelf: leavingDemo ? {} : refreshShelf(prev.shelf, library),
    wishlist: leavingDemo ? EMPTY_STATE.wishlist : prev.wishlist,
  };
}

/** Updates shelf metadata (covers, titles, totals) from a fresh sync without touching owned volumes. */
export function refreshShelf(shelf: Shelf, library: Library): Shelf {
  const byId = new Map(library.manga.map((e) => [e.media.id, e.media]));
  const next: Shelf = {};
  for (const series of Object.values(shelf)) {
    const media = byId.get(series.mediaId);
    next[series.mediaId] = media
      ? {
          ...series,
          title: media.title,
          cover: media.cover,
          color: media.color,
          siteUrl: media.siteUrl,
          totalVolumes: series.totalVolumes ?? media.volumes,
          ongoing: media.status === "RELEASING" || media.status === "HIATUS",
        }
      : series;
  }
  return next;
}
