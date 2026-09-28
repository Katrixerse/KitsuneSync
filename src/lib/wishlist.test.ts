import { describe, expect, it } from "vitest";
import { demoLibrary, demoShelf } from "./demo";
import { seriesFromEntry, type Shelf } from "./shelf";
import { buildWishlist, wishlistToText, type WishlistState } from "./wishlist";

const empty: WishlistState = { manual: [], dismissed: [] };

describe("buildWishlist", () => {
  const library = demoLibrary(new Date("2026-06-01T00:00:00Z"));
  const shelf = demoShelf(library);
  const items = buildWishlist(shelf, library.manga, empty);
  const find = (kind: string, title: string) => items.find((i) => i.kind === kind && i.title === title);

  it("lists gaps inside shelved series first", () => {
    expect(items[0].kind).toBe("gap");
    expect(find("gap", "BLAME!")?.volumes).toEqual([5]);
  });

  it("queues released volumes after the end of the shelf", () => {
    expect(find("next", "BLAME!")?.volumes).toEqual([7, 8, 9, 10]);
    expect(find("next", "Berserk")?.volumes).toEqual([39, 40, 41, 42]);
    expect(find("next", "Monster")?.volumes).toEqual([7, 8, 9]);
  });

  it("uses reading progress when the total is unknown", () => {
    const next = find("next", "Chainsaw Man");
    expect(next?.volumes).toEqual([15, 16, 17, 18, 19, 20]);
    expect(next?.reason).toMatch(/read up to vol\. 20/);
  });

  it("leaves finished sets alone", () => {
    expect(items.some((i) => i.title === "Pluto")).toBe(false);
    expect(items.filter((i) => i.title === "Akira" && i.kind !== "start")).toEqual([]);
  });

  it("suggests highly rated unowned manga and planning entries", () => {
    expect(find("start", "Vagabond")?.volumes).toEqual([1]);
    expect(find("start", "Solo Leveling")).toBeUndefined();
    expect(find("planning", "Planetes")).toBeDefined();
  });

  it("hides dismissed items until their volumes change", () => {
    const gapKey = find("gap", "BLAME!")!.key;
    const hidden = buildWishlist(shelf, library.manga, { ...empty, dismissed: [gapKey] });
    expect(hidden.some((i) => i.key === gapKey)).toBe(false);

    const blame = Object.values(shelf).find((s) => s.title === "BLAME!")!;
    const changed: Shelf = { ...shelf, [blame.mediaId]: { ...blame, owned: [1, 2, 6] } };
    const resurfaced = buildWishlist(changed, library.manga, { ...empty, dismissed: [gapKey] });
    expect(resurfaced.find((i) => i.kind === "gap" && i.title === "BLAME!")?.volumes).toEqual([3, 4, 5]);
  });

  it("includes manual wishes", () => {
    const withManual = buildWishlist({}, [], {
      manual: [{ id: "a", title: "Akira box set", note: "", addedAt: "" }],
      dismissed: [],
    });
    expect(withManual.map((i) => i.key)).toEqual(["manual:a"]);
  });

  it("does not suggest what is already shelved", () => {
    const vagabond = library.manga.find((e) => e.media.title === "Vagabond")!;
    const shelved = { ...shelf, [vagabond.media.id]: seriesFromEntry(vagabond) };
    expect(buildWishlist(shelved, library.manga, empty).some((i) => i.kind === "start" && i.title === "Vagabond")).toBe(
      false,
    );
  });
});

describe("wishlistToText", () => {
  it("renders one line per item", () => {
    expect(
      wishlistToText([
        { key: "a", kind: "gap", mediaId: 1, title: "BLAME!", cover: null, color: null, volumes: [5, 7, 8], reason: "", priority: 1 },
        { key: "b", kind: "manual", mediaId: null, title: "Art book", cover: null, color: null, volumes: [], reason: "", priority: 1 },
      ]),
    ).toBe("BLAME! vol. 5, 7–8\nArt book");
  });
});
