import { EDITION_LABELS, MAX_VOLUMES, type Edition, type Shelf, type ShelfSeries } from "./shelf";
import type { ManualWish, WishlistState } from "./wishlist";

/**
 * Checks data that crosses a trust boundary: Server Action arguments and
 * imported backups. Optional fields get defaults so older backups still load.
 */

export class ValidationError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") throw new ValidationError(`${field} must be text.`);
  if (value.length > max) throw new ValidationError(`${field} is too long.`);
  return value;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  return value === undefined || value === null ? null : text(value, field, max);
}

function isoDate(value: unknown, field: string): string {
  if (value === undefined) return new Date().toISOString();
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new ValidationError(`${field} must be a date.`);
  return date.toISOString();
}

function volume(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_VOLUMES;
}

export function parseShelfSeries(input: unknown): ShelfSeries {
  if (!isRecord(input)) throw new ValidationError("Series must be an object.");
  const { mediaId, totalVolumes, owned = [], edition = "standard", ongoing = false } = input;
  if (!Number.isSafeInteger(mediaId) || mediaId === 0) throw new ValidationError("Series needs a media id.");
  if (totalVolumes !== undefined && totalVolumes !== null && !volume(totalVolumes)) {
    throw new ValidationError("Total volumes is out of range.");
  }
  if (!Array.isArray(owned) || !owned.every(volume)) throw new ValidationError("Owned volumes are out of range.");
  if (typeof edition !== "string" || !(edition in EDITION_LABELS)) throw new ValidationError("Unknown edition.");
  if (typeof ongoing !== "boolean") throw new ValidationError("Ongoing must be true or false.");

  return {
    mediaId: mediaId as number,
    title: text(input.title, "Title", 500),
    cover: optionalText(input.cover, "Cover", 2048),
    color: optionalText(input.color, "Color", 32),
    siteUrl: optionalText(input.siteUrl, "Site URL", 2048),
    totalVolumes: (totalVolumes as number | null | undefined) ?? null,
    owned: [...new Set(owned as number[])].sort((a, b) => a - b),
    edition: edition as Edition,
    ongoing,
    addedAt: isoDate(input.addedAt, "Added at"),
    notes: text(input.notes, "Notes", 5000, ""),
  };
}

export function parseShelf(input: unknown): Shelf {
  if (!isRecord(input)) throw new ValidationError("Shelf must be an object.");
  const shelf: Shelf = {};
  for (const value of Object.values(input)) {
    const series = parseShelfSeries(value);
    shelf[series.mediaId] = series;
  }
  return shelf;
}

export function parseManualWish(input: unknown): ManualWish {
  if (!isRecord(input)) throw new ValidationError("Wish must be an object.");
  if (!isUuid(input.id)) throw new ValidationError("Wish needs an id.");
  return {
    id: input.id.toLowerCase(),
    title: text(input.title, "Title", 500),
    note: text(input.note, "Note", 2000, ""),
    addedAt: isoDate(input.addedAt, "Added at"),
  };
}

export function parseDismissKey(input: unknown): string {
  return text(input, "Wishlist key", 500);
}

export function parseWishlist(input: unknown): WishlistState {
  if (input === undefined) return { manual: [], dismissed: [] };
  if (!isRecord(input)) throw new ValidationError("Wishlist must be an object.");
  const { manual = [], dismissed = [] } = input;
  if (!Array.isArray(manual) || !Array.isArray(dismissed)) throw new ValidationError("Wishlist is malformed.");
  const wishes = new Map(manual.map(parseManualWish).map((w) => [w.id, w]));
  return { manual: [...wishes.values()], dismissed: [...new Set(dismissed.map(parseDismissKey))] };
}

/** Parses a KitsuneSync backup file. The AniList library is re-synced, not restored. */
export function parseBackup(json: string): { shelf: Shelf; wishlist: WishlistState } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ValidationError("That file isn't valid JSON.");
  }
  if (!isRecord(data) || data.app !== "kitsunesync" || !isRecord(data.shelf)) {
    throw new ValidationError("That file isn't a KitsuneSync backup.");
  }
  return { shelf: parseShelf(data.shelf), wishlist: parseWishlist(data.wishlist) };
}
