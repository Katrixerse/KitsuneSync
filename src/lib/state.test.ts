import { describe, expect, it } from "vitest";
import { demoLibrary, demoShelf } from "./demo";
import { seriesFromEntry } from "./shelf";
import { applySync, EMPTY_STATE } from "./state";

describe("applySync", () => {
  it("drops the demo shelf when switching to a real account", () => {
    const demo = demoLibrary();
    const prev = { ...EMPTY_STATE, library: demo, shelf: demoShelf(demo) };
    const real = { ...demo, demo: undefined };
    const next = applySync(prev, real);
    expect(next.library).toBe(real);
    expect(next.shelf).toEqual({});
  });

  it("refreshes shelf metadata but keeps owned volumes and manual totals", () => {
    const library = { ...demoLibrary(), demo: false };
    const entry = library.manga[0];
    const series = { ...seriesFromEntry(entry), title: "Old title", owned: [1, 2], totalVolumes: 7 };
    const prev = { ...EMPTY_STATE, library, shelf: { [series.mediaId]: series } };

    const next = applySync(prev, library);
    expect(next.shelf[series.mediaId]).toMatchObject({ title: entry.media.title, owned: [1, 2], totalVolumes: 7 });
    expect(next.wishlist).toBe(prev.wishlist);
  });
});
