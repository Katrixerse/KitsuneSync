import type { ListEntry } from "./anilist/types";

export type Edition = "standard" | "omnibus" | "deluxe" | "box-set";

export const EDITION_LABELS: Record<Edition, string> = {
  standard: "Standard",
  omnibus: "Omnibus",
  deluxe: "Deluxe / Hardcover",
  "box-set": "Box set",
};

export interface ShelfSeries {
  /** AniList media id, or a negative id for series added by hand. */
  mediaId: number;
  title: string;
  cover: string | null;
  color: string | null;
  siteUrl: string | null;
  /** Total volumes if known. Filled from AniList, can be overridden by hand. */
  totalVolumes: number | null;
  /** Owned volume numbers, sorted ascending, no duplicates. */
  owned: number[];
  edition: Edition;
  /** True when the series is still publishing volumes. */
  ongoing: boolean;
  addedAt: string;
  notes: string;
}

export type Shelf = Record<number, ShelfSeries>;

export const MAX_VOLUMES = 200;

export function seriesFromEntry(entry: ListEntry, now = new Date()): ShelfSeries {
  const { media } = entry;
  return {
    mediaId: media.id,
    title: media.title,
    cover: media.cover,
    color: media.color,
    siteUrl: media.siteUrl,
    totalVolumes: media.volumes,
    owned: [],
    edition: "standard",
    ongoing: media.status === "RELEASING" || media.status === "HIATUS",
    addedAt: now.toISOString(),
    notes: "",
  };
}

function normalizeOwned(volumes: Iterable<number>): number[] {
  return [...new Set(volumes)]
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= MAX_VOLUMES)
    .sort((a, b) => a - b);
}

export function toggleVolume(series: ShelfSeries, volume: number): ShelfSeries {
  const owned = series.owned.includes(volume)
    ? series.owned.filter((v) => v !== volume)
    : normalizeOwned([...series.owned, volume]);
  return { ...series, owned };
}

export function addVolumes(series: ShelfSeries, volumes: number[]): ShelfSeries {
  return { ...series, owned: normalizeOwned([...series.owned, ...volumes]) };
}

/** Marks volumes 1..n as owned, the common "I own the first n" case. */
export function ownFirst(series: ShelfSeries, n: number): ShelfSeries {
  return addVolumes(
    series,
    Array.from({ length: Math.max(0, n) }, (_, i) => i + 1),
  );
}

export function setTotalVolumes(series: ShelfSeries, total: number | null): ShelfSeries {
  const clean =
    total === null || !Number.isFinite(total) || total < 1
      ? null
      : Math.min(MAX_VOLUMES, Math.floor(total));
  return { ...series, totalVolumes: clean };
}

/** How many volume slots to draw: the known total, or enough to show every owned volume plus one. */
export function displayedVolumeCount(series: ShelfSeries): number {
  const highest = series.owned.at(-1) ?? 0;
  if (series.totalVolumes) return Math.max(series.totalVolumes, highest);
  return Math.max(highest + 1, 1);
}

/** Owned volumes below the highest owned one that are missing. */
export function gapVolumes(series: ShelfSeries): number[] {
  const highest = series.owned.at(-1) ?? 0;
  const owned = new Set(series.owned);
  const gaps: number[] = [];
  for (let v = 1; v < highest; v++) if (!owned.has(v)) gaps.push(v);
  return gaps;
}

/** Released volumes after the highest owned one. Empty when the total is unknown. */
export function nextVolumes(series: ShelfSeries): number[] {
  if (!series.totalVolumes) return [];
  const highest = series.owned.at(-1) ?? 0;
  const next: number[] = [];
  for (let v = highest + 1; v <= series.totalVolumes; v++) next.push(v);
  return next;
}

export function isComplete(series: ShelfSeries): boolean {
  return (
    !series.ongoing &&
    series.totalVolumes !== null &&
    series.owned.length >= series.totalVolumes &&
    gapVolumes(series).length === 0
  );
}

export function completion(series: ShelfSeries): number | null {
  if (!series.totalVolumes) return null;
  return Math.min(1, series.owned.length / series.totalVolumes);
}

/** Formats `[1,2,3,5,7,8]` as `"1–3, 5, 7–8"`. */
export function formatRanges(volumes: number[]): string {
  const sorted = normalizeOwned(volumes);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** Parses `"1-3, 5, 7–8"` into `[1,2,3,5,7,8]`. Invalid chunks are ignored. */
export function parseRanges(input: string): number[] {
  const volumes: number[] = [];
  for (const chunk of input.split(/[,\s]+/)) {
    const match = chunk.match(/^(\d+)(?:[-–](\d+))?$/);
    if (!match) continue;
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    const [lo, hi] = start <= end ? [start, end] : [end, start];
    for (let v = lo; v <= Math.min(hi, MAX_VOLUMES); v++) volumes.push(v);
  }
  return normalizeOwned(volumes);
}

export interface ShelfStats {
  series: number;
  volumes: number;
  complete: number;
  gaps: number;
}

export function shelfStats(shelf: Shelf): ShelfStats {
  const all = Object.values(shelf);
  return {
    series: all.length,
    volumes: all.reduce((n, s) => n + s.owned.length, 0),
    complete: all.filter(isComplete).length,
    gaps: all.reduce((n, s) => n + gapVolumes(s).length, 0),
  };
}
