import { describe, expect, it } from "vitest";
import { isUuid, parseBackup, parseShelfSeries, parseWishlist, ValidationError } from "./validate";

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
