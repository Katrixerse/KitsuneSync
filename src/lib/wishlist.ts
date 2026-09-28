import type { ListEntry } from "./anilist/types";
import { formatRanges, gapVolumes, nextVolumes, type Shelf } from "./shelf";

export type WishKind = "gap" | "next" | "manual" | "start" | "planning";

export const WISH_KIND_LABELS: Record<WishKind, { title: string; blurb: string }> = {
  gap: { title: "Fill the gaps", blurb: "Holes in series you already collect." },
  next: { title: "Next volumes", blurb: "Released volumes past the end of your shelf." },
  manual: { title: "Added by you", blurb: "Things you pinned by hand." },
  start: { title: "Start collecting", blurb: "Manga you rated highly but don't own on paper." },
  planning: { title: "From your planning list", blurb: "On your AniList plan-to-read." },
};

export interface ManualWish {
  id: string;
  title: string;
  note: string;
  addedAt: string;
}

export interface WishlistState {
  manual: ManualWish[];
  /** Keys of auto-generated items the user hid. */
  dismissed: string[];
}

export interface WishItem {
  /** Stable key. Includes the volume set so a dismissed item resurfaces when it changes. */
  key: string;
  kind: WishKind;
  mediaId: number | null;
  title: string;
  cover: string | null;
  color: string | null;
  volumes: number[];
  reason: string;
  priority: number;
}

export interface WishlistOptions {
  /** Minimum score (0-10) for the "start collecting" suggestions. */
  startThreshold?: number;
  maxSuggestions?: number;
}

export function buildWishlist(
  shelf: Shelf,
  manga: ListEntry[],
  state: WishlistState,
  { startThreshold = 8, maxSuggestions = 12 }: WishlistOptions = {},
): WishItem[] {
  const items: WishItem[] = [];
  const byMedia = new Map(manga.map((e) => [e.media.id, e]));

  for (const series of Object.values(shelf)) {
    const base = {
      mediaId: series.mediaId,
      title: series.title,
      cover: series.cover,
      color: series.color,
    };

    const gaps = gapVolumes(series);
    if (gaps.length) {
      items.push({
        ...base,
        key: `gap:${series.mediaId}:${formatRanges(gaps)}`,
        kind: "gap",
        volumes: gaps,
        reason: `Missing vol. ${formatRanges(gaps)} between volumes you own.`,
        priority: 100 + gaps.length,
      });
    }

    let next = nextVolumes(series);
    let reason = "";
    if (next.length) {
      reason = `Vol. ${formatRanges(next)} ${next.length === 1 ? "is" : "are"} out.`;
    } else if (!series.totalVolumes) {
      // Total unknown (usually an ongoing series): use reading progress as a hint.
      const read = byMedia.get(series.mediaId)?.progressVolumes ?? 0;
      const highest = series.owned.at(-1) ?? 0;
      if (read > highest) {
        next = Array.from({ length: read - highest }, (_, i) => highest + i + 1);
        reason = `You've read up to vol. ${read} but your shelf stops at ${highest || "zero"}.`;
      }
    }
    if (next.length) {
      items.push({
        ...base,
        key: `next:${series.mediaId}:${formatRanges(next)}`,
        kind: "next",
        volumes: next,
        reason,
        priority: 80 - Math.min(next.length, 20),
      });
    }
  }

  for (const wish of state.manual) {
    items.push({
      key: `manual:${wish.id}`,
      kind: "manual",
      mediaId: null,
      title: wish.title,
      cover: null,
      color: null,
      volumes: [],
      reason: wish.note,
      priority: 90,
    });
  }

  const unshelved = manga.filter((e) => !shelf[e.media.id] && e.media.format !== "NOVEL");

  unshelved
    .filter(
      (e) =>
        e.status !== "PLANNING" && e.status !== "DROPPED" && e.score >= startThreshold,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .forEach((e) =>
      items.push({
        key: `start:${e.media.id}`,
        kind: "start",
        mediaId: e.media.id,
        title: e.media.title,
        cover: e.media.cover,
        color: e.media.color,
        volumes: [1],
        reason: `You scored it ${e.score}/10 and own zero copies.`,
        priority: 40 + e.score,
      }),
    );

  unshelved
    .filter((e) => e.status === "PLANNING")
    .slice(0, maxSuggestions)
    .forEach((e) =>
      items.push({
        key: `planning:${e.media.id}`,
        kind: "planning",
        mediaId: e.media.id,
        title: e.media.title,
        cover: e.media.cover,
        color: e.media.color,
        volumes: [1],
        reason: e.media.volumes
          ? `${e.media.volumes} volumes. Start with vol. 1.`
          : "Planning to read. Vol. 1 is a cheap way in.",
        priority: 20,
      }),
    );

  const dismissed = new Set(state.dismissed);
  return items
    .filter((i) => !dismissed.has(i.key))
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

/** Plain-text shopping list for pasting into notes or a store search. */
export function wishlistToText(items: WishItem[]): string {
  return items
    .map((i) => (i.volumes.length ? `${i.title} vol. ${formatRanges(i.volumes)}` : i.title))
    .join("\n");
}
