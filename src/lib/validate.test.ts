import { describe, expect, it } from "vitest";
import {
  assertDismissedCount,
  assertManualWishCount,
  assertShelfSize,
  isUuid,
  MAX_DISMISSED_KEYS,
  MAX_MANUAL_WISHES,
  MAX_SHELF_SERIES,
  parseBackup,
  parseShelf,
  parseShelfSeries,
  parseWishlist,
  ValidationError,
} from "./validate";

const series = {
  mediaId: 30002,
  title: "Berserk",
  cover: null,
  color: "#e4a15d",
  siteUrl: "https://anilist.co/manga/30002",
  totalVolumes: 42,
  owned: [3, 1, 2, 2],
  edition: "deluxe",
  ongoing: true,
  addedAt: "2026-01-02T03:04:05.000Z",
  notes: "",
};

const WISH_ID = "0b9f7c4e-3a2d-4f1e-9c8b-7a6d5e4f3c2b";

describe("parseShelfSeries", () => {
  it("accepts a valid series and normalizes owned volumes", () => {
    expect(parseShelfSeries(series)).toEqual({ ...series, owned: [1, 2, 3] });
  });

  it("fills defaults for fields older backups may lack", () => {
    const parsed = parseShelfSeries({ mediaId: -1, title: "Art book" });
    expect(parsed).toMatchObject({ owned: [], edition: "standard", ongoing: false, notes: "", totalVolumes: null });
    expect(isNaN(Date.parse(parsed.addedAt))).toBe(false);
  });

  it.each([
    ["a missing id", { ...series, mediaId: undefined }],
    ["a fractional id", { ...series, mediaId: 1.5 }],
    ["out-of-range volumes", { ...series, owned: [0, 1] }],
    ["an unknown edition", { ...series, edition: "signed" }],
    ["a bad total", { ...series, totalVolumes: 999 }],
    ["a non-string title", { ...series, title: 42 }],
    ["an invalid date", { ...series, addedAt: "yesterday" }],
  ])("rejects %s", (_, input) => {
    expect(() => parseShelfSeries(input)).toThrow(ValidationError);
  });

  it("accepts AniList covers, links and colours, or none at all", () => {
    const full = {
      ...series,
      cover: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30002-7EzO7o21jzeF.jpg",
      color: "#E4A15D",
      siteUrl: "https://anilist.co/search/manga?search=Berserk",
    };
    expect(parseShelfSeries(full)).toMatchObject({ cover: full.cover, color: "#E4A15D", siteUrl: full.siteUrl });
    // What the demo and the add-by-hand form send.
    expect(parseShelfSeries({ ...series, cover: null, color: null, siteUrl: null })).toMatchObject({
      cover: null,
      color: null,
      siteUrl: null,
    });
    expect(parseShelfSeries({ mediaId: -1, title: "Art book" })).toMatchObject({ cover: null, color: null, siteUrl: null });
  });

  it.each([
    ["a cover on another host", { cover: "https://evil.example/s4.anilist.co/file/x.jpg" }, "AniList image URL"],
    ["a cover over http", { cover: "http://s4.anilist.co/file/x.jpg" }, "AniList image URL"],
    ["a javascript: cover", { cover: "javascript:alert(1)" }, "AniList image URL"],
    ["a site link off AniList", { siteUrl: "https://anilist.co.evil.example/manga/1" }, "AniList link"],
    ["a non-hex colour", { color: "red" }, "hex code"],
    ["a short hex colour", { color: "#fff" }, "hex code"],
    ["a colour with extra text", { color: "#e4a15d;background:url(x)" }, "hex code"],
  ])("rejects %s", (_, patch, message) => {
    expect(() => parseShelfSeries({ ...series, ...patch })).toThrow(message);
  });
});

describe("size caps", () => {
  const wish = { id: WISH_ID, title: "Artbook", note: "", addedAt: "2026-01-01T00:00:00.000Z" };

  it("allows a shelf at the cap and refuses one over it", () => {
    const entries = Array.from({ length: MAX_SHELF_SERIES }, (_, i) => [i + 1, { ...series, mediaId: i + 1 }]);
    expect(Object.keys(parseShelf(Object.fromEntries(entries)))).toHaveLength(MAX_SHELF_SERIES);
    const over = Object.fromEntries([...entries, [MAX_SHELF_SERIES + 1, { ...series, mediaId: MAX_SHELF_SERIES + 1 }]]);
    expect(() => parseShelf(over)).toThrow(`A shelf can hold at most ${MAX_SHELF_SERIES} series.`);
  });

  it("refuses an oversized shelf before looking at its items", () => {
    const junk = Object.fromEntries(Array.from({ length: MAX_SHELF_SERIES + 1 }, (_, i) => [i, null]));
    expect(() => parseShelf(junk)).toThrow("A shelf can hold at most");
  });

  it("allows a wishlist at the caps and refuses one over them", () => {
    const manual = Array.from({ length: MAX_MANUAL_WISHES }, (_, i) => ({ ...wish, id: WISH_ID.replace(/.{4}$/, String(1000 + i)) }));
    const dismissed = Array.from({ length: MAX_DISMISSED_KEYS }, (_, i) => `gap:${i}`);
    expect(parseWishlist({ manual, dismissed })).toMatchObject({ manual: expect.any(Array), dismissed });
    expect(() => parseWishlist({ manual: [...manual, wish], dismissed: [] })).toThrow(
      `A wishlist can hold at most ${MAX_MANUAL_WISHES} items added by hand.`,
    );
    expect(() => parseWishlist({ manual: [], dismissed: [...dismissed, "gap:x"] })).toThrow(
      `A wishlist can hide at most ${MAX_DISMISSED_KEYS} items.`,
    );
  });

  it("refuses oversized wishlist arrays before looking at their items", () => {
    expect(() => parseWishlist({ manual: new Array(MAX_MANUAL_WISHES + 1).fill(null) })).toThrow("items added by hand");
    expect(() => parseWishlist({ dismissed: new Array(MAX_DISMISSED_KEYS + 1).fill(42) })).toThrow("can hide at most");
  });

  it("exposes the same checks for one-at-a-time writes", () => {
    expect(() => assertShelfSize(MAX_SHELF_SERIES)).not.toThrow();
    expect(() => assertShelfSize(MAX_SHELF_SERIES + 1)).toThrow(ValidationError);
    expect(() => assertManualWishCount(MAX_MANUAL_WISHES)).not.toThrow();
    expect(() => assertManualWishCount(MAX_MANUAL_WISHES + 1)).toThrow(ValidationError);
    expect(() => assertDismissedCount(MAX_DISMISSED_KEYS)).not.toThrow();
    expect(() => assertDismissedCount(MAX_DISMISSED_KEYS + 1)).toThrow(ValidationError);
  });
});

describe("parseWishlist", () => {
  it("dedupes wishes and dismissed keys", () => {
    const wish = { id: WISH_ID, title: "Artbook", note: "", addedAt: "2026-01-01T00:00:00.000Z" };
    expect(parseWishlist({ manual: [wish, wish], dismissed: ["gap:1", "gap:1"] })).toEqual({
      manual: [wish],
      dismissed: ["gap:1"],
    });
  });

  it("rejects wishes without a uuid", () => {
    expect(() => parseWishlist({ manual: [{ id: "1", title: "x" }] })).toThrow(ValidationError);
  });
});

describe("parseBackup", () => {
  it("reads an exported backup", () => {
    const json = JSON.stringify({ app: "kitsunesync", version: 1, shelf: { 30002: series }, wishlist: undefined });
    expect(parseBackup(json)).toEqual({
      shelf: { 30002: { ...series, owned: [1, 2, 3] } },
      wishlist: { manual: [], dismissed: [] },
    });
  });

  it("rejects other JSON", () => {
    expect(() => parseBackup('{"hello":1}')).toThrow("isn't a KitsuneSync backup");
    expect(() => parseBackup("nope")).toThrow("isn't valid JSON");
  });
});

describe("isUuid", () => {
  it("matches uuids only", () => {
    expect(isUuid(WISH_ID)).toBe(true);
    expect(isUuid("../../etc")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
