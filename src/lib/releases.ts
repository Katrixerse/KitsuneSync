import type { Media } from "./anilist/types";
import { knownVolumes, type ShelfSeries } from "./shelf";

/**
 * Release alerts: a sync that finds more volumes on AniList for a shelved
 * series than the last sync did means something came out in between. The
 * shelf remembers that count in `releasedVolumes`; the alerts live next to the
 * shelf and wishlist in the state (and in Postgres) until dismissed.
 */

export interface ReleaseAlert {
  mediaId: number;
  title: string;
  cover: string | null;
  color: string | null;
  /** The volumes that came out since the earlier sync, ascending. */
  volumes: number[];
  /** When the sync that noticed them ran (the library's syncedAt). */
  releasedAt: string;
}

/**
 * Refreshes one shelved series from its AniList media and reports the volumes
 * AniList added since the last sync, if any.
 *
 * The total follows AniList while it still equals what AniList said last time;
 * a total typed by hand (one that differs) is kept. Series saved before
 * `releasedVolumes` existed have it null: their first sync only records the
 * count, raises no alert and keeps the total unless there was none.
 */
export function refreshSeries(
  series: ShelfSeries,
  media: Media,
  releasedAt: string,
): { series: ShelfSeries; release: ReleaseAlert | null } {
  const prev = series.releasedVolumes;
  const cur = knownVolumes(media);
  const newVolumes =
    prev !== null && cur !== null && cur > prev ? Array.from({ length: cur - prev }, (_, i) => prev + 1 + i) : [];

  let totalVolumes = series.totalVolumes;
  if (totalVolumes === null) totalVolumes = cur;
  else if (totalVolumes === prev) totalVolumes = cur ?? totalVolumes;

  const next: ShelfSeries = {
    ...series,
    title: media.title,
    cover: media.cover,
    color: media.color,
    siteUrl: media.siteUrl,
    totalVolumes,
    // A count AniList no longer has (null) doesn't erase what we knew.
    releasedVolumes: cur ?? prev,
    ongoing: media.status === "RELEASING" || media.status === "HIATUS",
  };
  const release: ReleaseAlert | null = newVolumes.length
    ? { mediaId: media.id, title: media.title, cover: media.cover, color: media.color, volumes: newVolumes, releasedAt }
    : null;
  return { series: next, release };
}

/**
 * Folds fresh alerts into the ones still showing, one per series: a series
 * alerted again keeps the volumes nobody dismissed yet and takes the new date.
 * Returns `prev` itself when there is nothing new, so callers can skip a save.
 * Sorted newest first, then by media id, the same order the database returns.
 */
export function mergeReleases(prev: ReleaseAlert[], fresh: ReleaseAlert[]): ReleaseAlert[] {
  if (!fresh.length) return prev;
  const byId = new Map(prev.map((r) => [r.mediaId, r]));
  for (const release of fresh) {
    const earlier = byId.get(release.mediaId);
    byId.set(
      release.mediaId,
      earlier ? { ...release, volumes: [...new Set([...earlier.volumes, ...release.volumes])].sort((a, b) => a - b) } : release,
    );
  }
  return sortReleases([...byId.values()]);
}

/** Newest first, then by media id; ISO timestamps sort as text. */
export function sortReleases(releases: ReleaseAlert[]): ReleaseAlert[] {
  return [...releases].sort((a, b) =>
    a.releasedAt === b.releasedAt ? a.mediaId - b.mediaId : a.releasedAt < b.releasedAt ? 1 : -1,
  );
}
