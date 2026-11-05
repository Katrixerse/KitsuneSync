import { describe, expect, it } from "vitest";
import type { Library } from "./anilist/types";
import { demoLibrary, demoShelf } from "./demo";
import type { ReleaseAlert } from "./releases";
import { seriesFromEntry } from "./shelf";
import { applySync, EMPTY_STATE, refreshShelf } from "./state";

// Akira in the demo: 6 volumes on AniList.
const entry = demoLibrary().manga[0];
const id = entry.media.id;

/** The demo library as a real account, with Akira's AniList volume count changed. */
function libraryWith(volumes: number | null, syncedAt = "2026-06-01T00:00:00.000Z"): Library {
  const library = demoLibrary(new Date(syncedAt));
  return {
    ...library,
    demo: false,
    manga: library.manga.map((e) => (e.media.id === id ? { ...e, media: { ...e.media, volumes } } : e)),
  };
}

const akiraAlert = (volumes: number[], releasedAt: string): ReleaseAlert => ({
  mediaId: id,
  title: entry.media.title,
  cover: null,
  color: null,
  volumes,
  releasedAt,
});

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

  it("flags the volumes AniList added since the last sync", () => {
    const library = libraryWith(8);
    // Added when AniList listed 6: total and count are both 6.
    const series = { ...seriesFromEntry(entry), owned: [1, 2] };
    const next = applySync({ ...EMPTY_STATE, library, shelf: { [id]: series } }, library);
    expect(next.releases).toEqual([akiraAlert([7, 8], library.syncedAt)]);
    expect(next.shelf[id]).toMatchObject({ owned: [1, 2], totalVolumes: 8, releasedVolumes: 8 });
  });

  it("records the count without an alert when none was known", () => {
    // Series saved before release alerts existed: the total is kept, unless there was none.
    const library = libraryWith(8);
    const kept = { ...seriesFromEntry(entry), totalVolumes: 6, releasedVolumes: null };
    const filled = { ...seriesFromEntry(entry), totalVolumes: null, releasedVolumes: null };
    const next = applySync({ ...EMPTY_STATE, library, shelf: { [id]: kept } }, library);
    expect(next.releases).toEqual([]);
    expect(next.shelf[id]).toMatchObject({ totalVolumes: 6, releasedVolumes: 8 });
    expect(applySync({ ...EMPTY_STATE, library, shelf: { [id]: filled } }, library).shelf[id]).toMatchObject({
      totalVolumes: 8,
      releasedVolumes: 8,
    });
    // From then on the total follows AniList, since it matches the recorded count.
    const again = applySync(applySync({ ...EMPTY_STATE, library, shelf: { [id]: filled } }, library), libraryWith(9));
    expect(again.shelf[id]).toMatchObject({ totalVolumes: 9, releasedVolumes: 9 });
    expect(again.releases).toEqual([akiraAlert([9], library.syncedAt)]);
  });

  it("keeps a total typed by hand and follows one AniList filled in", () => {
    const library = libraryWith(8);
    const byHand = { ...seriesFromEntry(entry), totalVolumes: 12 };
    const fromAniList = seriesFromEntry(entry);
    expect(applySync({ ...EMPTY_STATE, library, shelf: { [id]: byHand } }, library).shelf[id]).toMatchObject({
      totalVolumes: 12,
      releasedVolumes: 8,
    });
    expect(applySync({ ...EMPTY_STATE, library, shelf: { [id]: fromAniList } }, library).shelf[id]).toMatchObject({
      totalVolumes: 8,
      releasedVolumes: 8,
    });
  });

  it("keeps the last count when AniList no longer has one", () => {
    const library = libraryWith(null);
    const next = applySync({ ...EMPTY_STATE, library, shelf: { [id]: seriesFromEntry(entry) } }, library);
    expect(next.releases).toEqual([]);
    expect(next.shelf[id]).toMatchObject({ totalVolumes: 6, releasedVolumes: 6 });
  });

  it("leaves series missing from the sync, and hand-added ones, alone", () => {
    const library = libraryWith(8);
    const gone = { ...seriesFromEntry(entry), mediaId: 123_456 };
    const byHand = { ...seriesFromEntry(entry), mediaId: -1, title: "Art book", releasedVolumes: null, totalVolumes: 1 };
    const next = applySync({ ...EMPTY_STATE, library, shelf: { [gone.mediaId]: gone, [-1]: byHand } }, library);
    expect(next.shelf).toEqual({ [gone.mediaId]: gone, [-1]: byHand });
    expect(next.releases).toEqual([]);
  });

  it("clears release alerts when leaving the demo", () => {
    const demo = demoLibrary();
    const prev = applySync({ ...EMPTY_STATE, shelf: demoShelf(demo) }, demo);
    expect(prev.releases).toHaveLength(1);
    const next = applySync(prev, { ...demo, demo: undefined });
    expect(next).toMatchObject({ shelf: {}, wishlist: { manual: [], dismissed: [] }, releases: [] });
    // Syncing the demo again is not leaving it.
    expect(applySync(prev, demoLibrary()).releases).toEqual(prev.releases);
  });

  it("merges new alerts with those still showing, one per series, newest first", () => {
    const first = libraryWith(7, "2026-06-01T00:00:00.000Z");
    const second = libraryWith(8, "2026-06-02T00:00:00.000Z");
    const older: ReleaseAlert = { ...akiraAlert([2], "2026-05-20T00:00:00.000Z"), mediaId: 999, title: "Other" };

    const once = applySync({ ...EMPTY_STATE, library: first, shelf: { [id]: seriesFromEntry(entry) } }, first);
    expect(once.releases).toEqual([akiraAlert([7], first.syncedAt)]);

    const twice = applySync({ ...once, releases: [...once.releases, older] }, second);
    expect(twice.releases).toEqual([akiraAlert([7, 8], second.syncedAt), older]);
    expect(twice.shelf[id]).toMatchObject({ totalVolumes: 8, releasedVolumes: 8 });
  });

  it("hands back the same alerts when a sync finds nothing new, so nothing is saved", () => {
    const library = libraryWith(8);
    const once = applySync({ ...EMPTY_STATE, library, shelf: { [id]: seriesFromEntry(entry) } }, library);
    const again = applySync(once, libraryWith(8, "2026-06-03T00:00:00.000Z"));
    expect(again.releases).toBe(once.releases);
    expect(again.wishlist).toBe(once.wishlist);
  });
});

describe("refreshShelf", () => {
  it("returns the refreshed shelf with the alerts it found", () => {
    const library = libraryWith(8);
    const { shelf, releases } = refreshShelf({ [id]: seriesFromEntry(entry) }, library);
    expect(shelf[id].releasedVolumes).toBe(8);
    expect(releases).toEqual([akiraAlert([7, 8], library.syncedAt)]);
    expect(refreshShelf({}, library)).toEqual({ shelf: {}, releases: [] });
  });
});
