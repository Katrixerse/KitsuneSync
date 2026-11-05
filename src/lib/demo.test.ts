import { describe, expect, it } from "vitest";
import { demoLibrary, demoShelf } from "./demo";
import { knownVolumes } from "./shelf";
import { applySync, EMPTY_STATE } from "./state";

describe("demo", () => {
  const library = demoLibrary(new Date("2026-06-01T00:00:00Z"));
  const shelf = demoShelf(library);
  const berserk = library.manga.find((e) => e.media.title === "Berserk")!;

  it("remembers AniList's count for every shelved series, one volume behind on Berserk", () => {
    expect(Object.keys(shelf).length).toBeGreaterThan(1);
    for (const series of Object.values(shelf)) {
      const entry = library.manga.find((e) => e.media.id === series.mediaId)!;
      if (series.mediaId === berserk.media.id) {
        expect(knownVolumes(entry.media)).toBe(43);
        expect(series).toMatchObject({ totalVolumes: 42, releasedVolumes: 42, ongoing: true });
      } else {
        expect(series.releasedVolumes).toBe(knownVolumes(entry.media));
      }
    }
  });

  it("opens with one release alert once the library is applied", () => {
    const state = applySync({ ...EMPTY_STATE, shelf }, library);
    expect(state.releases).toEqual([
      {
        mediaId: berserk.media.id,
        title: "Berserk",
        cover: null,
        color: "#861c1c",
        volumes: [43],
        releasedAt: library.syncedAt,
      },
    ]);
    expect(state.shelf[berserk.media.id]).toMatchObject({
      owned: shelf[berserk.media.id].owned,
      totalVolumes: 43,
      releasedVolumes: 43,
    });
    // Every other series was already up to date.
    const moved = Object.values(state.shelf).filter((s) => s.releasedVolumes !== shelf[s.mediaId].releasedVolumes);
    expect(moved.map((s) => s.title)).toEqual(["Berserk"]);
  });
});
