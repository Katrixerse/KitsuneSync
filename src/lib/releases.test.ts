import { describe, expect, it } from "vitest";
import { demoLibrary } from "./demo";
import { mergeReleases, refreshSeries, sortReleases, type ReleaseAlert } from "./releases";
import { seriesFromEntry } from "./shelf";

const AT = "2026-06-01T00:00:00.000Z";
// Akira: 6 volumes on AniList, finished.
const entry = demoLibrary().manga[0];
const media = (volumes: number | null) => ({ ...entry.media, volumes });

function alert(mediaId: number, volumes: number[], releasedAt = AT): ReleaseAlert {
  return { mediaId, title: `Series ${mediaId}`, cover: null, color: null, volumes, releasedAt };
}

describe("refreshSeries", () => {
  // Synced when AniList listed 6 volumes: total and count both 6.
  const synced = seriesFromEntry(entry);

  it("reports the volumes added since the last sync and moves the count on", () => {
    const { series, release } = refreshSeries({ ...synced, owned: [1, 2] }, media(9), AT);
    expect(release).toEqual({
      mediaId: entry.media.id,
      title: entry.media.title,
      cover: null,
      color: null,
      volumes: [7, 8, 9],
      releasedAt: AT,
    });
    expect(series).toMatchObject({ owned: [1, 2], releasedVolumes: 9, totalVolumes: 9 });
  });

  it("refreshes metadata from AniList like a sync always did", () => {
    const stale = { ...synced, title: "Old title", cover: null, color: null, ongoing: false };
    const fresh = {
      ...media(6),
      title: "AKIRA",
      cover: "https://s4.anilist.co/file/x.jpg",
      color: "#123456",
      status: "RELEASING" as const,
    };
    expect(refreshSeries(stale, fresh, AT).series).toMatchObject({
      title: "AKIRA",
      cover: fresh.cover,
      color: "#123456",
      ongoing: true,
      releasedVolumes: 6,
    });
  });

  it("stays quiet when the count is the same, lower, or was never known", () => {
    expect(refreshSeries(synced, media(6), AT).release).toBeNull();
    // AniList corrected its count downwards: nothing came out, the new count is recorded.
    const lower = refreshSeries(synced, media(5), AT);
    expect(lower.release).toBeNull();
    expect(lower.series).toMatchObject({ releasedVolumes: 5, totalVolumes: 5 });
    // Saved before release alerts existed: the first sync only records the count.
    const first = refreshSeries({ ...synced, releasedVolumes: null }, media(9), AT);
    expect(first.release).toBeNull();
    expect(first.series).toMatchObject({ releasedVolumes: 9, totalVolumes: 6 });
  });

  it("keeps the last count and total when AniList no longer has one", () => {
    const { series, release } = refreshSeries(synced, media(null), AT);
    expect(release).toBeNull();
    expect(series).toMatchObject({ releasedVolumes: 6, totalVolumes: 6 });
  });

  it("fills a missing total, follows one AniList filled in and keeps one typed by hand", () => {
    expect(refreshSeries({ ...synced, totalVolumes: null }, media(9), AT).series.totalVolumes).toBe(9);
    expect(refreshSeries({ ...synced, totalVolumes: null, releasedVolumes: null }, media(9), AT).series.totalVolumes).toBe(9);
    expect(refreshSeries(synced, media(9), AT).series.totalVolumes).toBe(9);
    const byHand = refreshSeries({ ...synced, totalVolumes: 12 }, media(9), AT);
    expect(byHand.series.totalVolumes).toBe(12);
    expect(byHand.release?.volumes).toEqual([7, 8, 9]); // the alert doesn't depend on the total
  });

  it("clamps AniList's count to what a shelf can hold", () => {
    const { series, release } = refreshSeries({ ...synced, releasedVolumes: 199, totalVolumes: 199 }, media(250), AT);
    expect(release?.volumes).toEqual([200]);
    expect(series).toMatchObject({ releasedVolumes: 200, totalVolumes: 200 });
    expect(refreshSeries(synced, media(0), AT).series).toMatchObject({ releasedVolumes: 6, totalVolumes: 6 });
  });
});

describe("mergeReleases", () => {
  it("hands back the same list when nothing is new", () => {
    const prev = [alert(1, [3])];
    expect(mergeReleases(prev, [])).toBe(prev);
  });

  it("keeps one alert per series, pooling volumes nobody dismissed with the new ones", () => {
    const later = "2026-06-02T00:00:00.000Z";
    const prev = [alert(1, [3]), alert(2, [5])];
    const merged = mergeReleases(prev, [{ ...alert(1, [4, 5], later), title: "Renamed" }, alert(3, [1], later)]);
    expect(merged).toEqual([
      { ...alert(1, [3, 4, 5], later), title: "Renamed" },
      alert(3, [1], later),
      alert(2, [5]),
    ]);
    expect(prev).toEqual([alert(1, [3]), alert(2, [5])]); // untouched
  });

  it("sorts newest first, then by media id", () => {
    const older = "2026-05-20T00:00:00.000Z";
    expect(sortReleases([alert(9, [1], older), alert(5, [1]), alert(2, [1]), alert(7, [1], older)])).toEqual([
      alert(2, [1]),
      alert(5, [1]),
      alert(7, [1], older),
      alert(9, [1], older),
    ]);
  });
});
