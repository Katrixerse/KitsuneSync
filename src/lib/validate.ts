import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH, normalizeLinkCode } from "./link-code";
import { EDITION_LABELS, MAX_VOLUMES, type Edition, type Shelf, type ShelfSeries } from "./shelf";
import type { ManualWish, WishlistState } from "./wishlist";

/**
 * Checks data that crosses a trust boundary: Server Action arguments and
 * imported backups. Optional fields get defaults so older backups still load.
 */

export class ValidationError extends Error {}

/** Size caps, so one profile can't grow without bound. Enforced on imports and on single-item writes alike. */
export const MAX_SHELF_SERIES = 2000;
export const MAX_MANUAL_WISHES = 500;
export const MAX_DISMISSED_KEYS = 5000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// AniList's CDN is the only image host next.config.ts allows for next/image.
const COVER_PREFIX = "https://s4.anilist.co/file/";
const SITE_PREFIX = "https://anilist.co/";
// AniList cover colours are 6-digit hex.
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const LINK_CODE = new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`);

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

function optionalUrl(value: unknown, field: string, prefix: string, message: string): string | null {
  const url = optionalText(value, field, 2048);
  if (url !== null && !url.startsWith(prefix)) throw new ValidationError(message);
  return url;
}

/** Throws when a shelf of `count` series would be over the cap. */
export function assertShelfSize(count: number) {
  if (count > MAX_SHELF_SERIES) throw new ValidationError(`A shelf can hold at most ${MAX_SHELF_SERIES} series.`);
}

/** Throws when `count` hand-added wishes would be over the cap. */
export function assertManualWishCount(count: number) {
  if (count > MAX_MANUAL_WISHES) {
    throw new ValidationError(`A wishlist can hold at most ${MAX_MANUAL_WISHES} items added by hand.`);
  }
}

/** Throws when `count` hidden wishlist items would be over the cap. */
export function assertDismissedCount(count: number) {
  if (count > MAX_DISMISSED_KEYS) throw new ValidationError(`A wishlist can hide at most ${MAX_DISMISSED_KEYS} items.`);
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
  const color = optionalText(input.color, "Color", 32);
  if (color !== null && !HEX_COLOR.test(color)) throw new ValidationError("Color must be a hex code like #e4a15d.");

  return {
    mediaId: mediaId as number,
    title: text(input.title, "Title", 500),
    cover: optionalUrl(input.cover, "Cover", COVER_PREFIX, "Cover must be an AniList image URL."),
    color,
    siteUrl: optionalUrl(input.siteUrl, "Site URL", SITE_PREFIX, "Site URL must be an AniList link."),
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
  const values = Object.values(input);
  // Checked up front so an oversized payload is refused before any per-item work.
  assertShelfSize(values.length);
  const shelf: Shelf = {};
  for (const value of values) {
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
  assertManualWishCount(manual.length);
  assertDismissedCount(dismissed.length);
  const wishes = new Map(manual.map(parseManualWish).map((w) => [w.id, w]));
  return { manual: [...wishes.values()], dismissed: [...new Set(dismissed.map(parseDismissKey))] };
}

/** A link code as typed on the other device; case, spaces and dashes don't matter. */
export function parseLinkCode(input: unknown): string {
  const code = typeof input === "string" ? normalizeLinkCode(input) : "";
  if (!LINK_CODE.test(code)) throw new ValidationError("That doesn't look like a link code.");
  return code;
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
