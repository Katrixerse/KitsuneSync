import { afterEach, describe, expect, it, vi } from "vitest";
import { AniListError, fetchLibrary, normalizeLibrary, type RawLibraryResponse } from "./client";

function rawEntry(id: number, mediaId: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: "COMPLETED",
    score: 8.5,
    progress: 12,
    progressVolumes: null,
    repeat: null,
    updatedAt: id,
    completedAt: { year: 2024, month: 3, day: null },
    media: {
      id: mediaId,
      idMal: null,
      type: "ANIME",
      format: "TV",
      status: "FINISHED",
      episodes: 12,
      chapters: null,
      volumes: null,
      duration: 24,
      averageScore: 80,
      genres: ["Action"],
      countryOfOrigin: "JP",
      siteUrl: `https://anilist.co/anime/${mediaId}`,
      title: { userPreferred: `Show ${mediaId}`, native: null },
      coverImage: { large: "https://s4.anilist.co/file/x.jpg", color: "#fff" },
      startDate: { year: 2020 },
    },
    ...overrides,
  };
}

const user = { id: 7, name: "tester", avatar: { large: null }, bannerImage: null, siteUrl: "https://anilist.co/user/tester" };

const response: RawLibraryResponse = {
  data: {
    anime: {
      user,
      lists: [
        { isCustomList: false, entries: [rawEntry(1, 100), rawEntry(3, 300)] },
        // Custom lists repeat entries that already appear in a status list.
        { isCustomList: true, entries: [rawEntry(1, 100)] },
      ],
    } as never,
    manga: { user, lists: [] } as never,
  },
};

describe("normalizeLibrary", () => {
  it("flattens lists, drops custom-list duplicates and sorts by update time", () => {
    const lib = normalizeLibrary(response, new Date("2026-01-01T00:00:00Z"));
    expect(lib.user).toMatchObject({ id: 7, name: "tester", avatar: null });
    expect(lib.anime.map((e) => e.id)).toEqual([3, 1]);
    expect(lib.anime[0]).toMatchObject({ repeat: 0, completedAt: "2024-03-01", score: 8.5 });
    expect(lib.anime[0].media).toMatchObject({ title: "Show 300", cover: "https://s4.anilist.co/file/x.jpg", year: 2020 });
    expect(lib.syncedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("throws a 404 when there is no user", () => {
    expect(() => normalizeLibrary({ data: { anime: null, manga: null } })).toThrow(AniListError);
  });
});

describe("fetchLibrary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects invalid usernames without calling AniList", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchLibrary("not a name!")).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps AniList's not-found error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { anime: null, manga: null }, errors: [{ message: "Not Found.", status: 404 }] }), {
          status: 404,
        }),
      ),
    );
    await expect(fetchLibrary("ghost")).rejects.toMatchObject({ status: 404, message: 'No AniList user named "ghost".' });
  });

  it("maps rate limiting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(fetchLibrary("busy")).rejects.toMatchObject({ status: 429 });
  });

  it("returns the normalized library on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 })));
    const lib = await fetchLibrary("tester");
    expect(lib.anime).toHaveLength(2);
  });
});
