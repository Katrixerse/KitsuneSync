import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "@/lib/db/migrate";
import { getPool } from "@/lib/db/pool";
import * as repo from "@/lib/db/repo";
import { SYNC_LIMIT } from "@/lib/rate-limit";
import type { ShelfSeries } from "@/lib/shelf";
import { libraryCache } from "@/lib/sync-cache";
import { MAX_DISMISSED_KEYS, MAX_MANUAL_WISHES, MAX_SHELF_SERIES, ValidationError } from "@/lib/validate";
import { addManualWishAction, dismissWishAction, syncLibraryAction, upsertSeriesAction } from "./actions";

// The actions read the profile cookie and request headers through next/headers,
// which only works inside a request, so the "request" is simulated here.
const request = vi.hoisted(() => ({ profileId: null as string | null, forwardedFor: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kitsune_profile" && request.profileId ? { value: request.profileId } : undefined),
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(request.forwardedFor ? { "x-forwarded-for": request.forwardedFor } : {}),
}));

function series(mediaId: number, patch: Partial<ShelfSeries> = {}): ShelfSeries {
  return {
    mediaId,
    title: `Series ${mediaId}`,
    cover: null,
    color: null,
    siteUrl: null,
    totalVolumes: null,
    owned: [],
    edition: "standard",
    ongoing: false,
    addedAt: "2026-01-01T00:00:00.000Z",
    notes: "",
    ...patch,
  };
}

const user = { id: 7, name: "Tester", avatar: { large: null }, bannerImage: null, siteUrl: "https://anilist.co/user/Tester" };
const anilistBody = { data: { anime: { user, lists: [] }, manga: { user, lists: [] } } };

describe.skipIf(!process.env.DATABASE_URL)("actions (Postgres)", () => {
  const profiles: string[] = [];

  /** Points the fake request at a fresh profile, so every test has its own rows and its own sync budget. */
  async function freshProfile(): Promise<string> {
    const id = randomUUID();
    profiles.push(id);
    await repo.touchProfile(getPool(), id);
    request.profileId = id;
    request.forwardedFor = null;
    return id;
  }

  beforeAll(async () => {
    await migrate();
  });

  afterEach(() => {
    libraryCache.clear();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    for (const id of profiles) await repo.deleteProfile(getPool(), id);
    await getPool().end();
  });

  it("caps how many series one shelf can hold", async () => {
    const profileId = await freshProfile();
    const full = Object.fromEntries(Array.from({ length: MAX_SHELF_SERIES }, (_, i) => [i + 1, series(i + 1)]));
    await repo.replaceShelf(getPool(), profileId, full);

    await expect(upsertSeriesAction(series(-1))).rejects.toThrow(ValidationError);
    await expect(upsertSeriesAction(series(-1))).rejects.toThrow(`A shelf can hold at most ${MAX_SHELF_SERIES} series.`);
    // Changing a series already on the shelf is still fine at the cap.
    await expect(upsertSeriesAction(series(1, { owned: [1, 2], notes: "signed" }))).resolves.toBeUndefined();

    const state = await repo.loadState(getPool(), profileId);
    expect(Object.keys(state.shelf)).toHaveLength(MAX_SHELF_SERIES);
    expect(state.shelf[1]).toMatchObject({ owned: [1, 2], notes: "signed" });
    expect(state.shelf[-1]).toBeUndefined();

    await repo.deleteSeries(getPool(), profileId, 1);
    await expect(upsertSeriesAction(series(-1))).resolves.toBeUndefined();
    expect((await repo.loadState(getPool(), profileId)).shelf[-1]).toMatchObject({ title: "Series -1" });
  });

  it("caps how many wishes can be added by hand", async () => {
    const profileId = await freshProfile();
    const manual = Array.from({ length: MAX_MANUAL_WISHES }, (_, i) => ({
      id: randomUUID(),
      title: `Wish ${i}`,
      note: "",
      addedAt: "2026-01-01T00:00:00.000Z",
    }));
    await repo.replaceWishlist(getPool(), profileId, { manual, dismissed: [] });

    const extra = { id: randomUUID(), title: "One more", note: "", addedAt: "2026-01-01T00:00:00.000Z" };
    await expect(addManualWishAction(extra)).rejects.toThrow(
      `A wishlist can hold at most ${MAX_MANUAL_WISHES} items added by hand.`,
    );
    await expect(addManualWishAction(manual[0])).resolves.toBeUndefined();
    expect((await repo.loadState(getPool(), profileId)).wishlist.manual).toHaveLength(MAX_MANUAL_WISHES);

    // Deleting through the dismiss action still works at the cap, and frees a slot.
    await expect(dismissWishAction(`manual:${manual[0].id}`)).resolves.toBeUndefined();
    await expect(addManualWishAction(extra)).resolves.toBeUndefined();
    const { manual: after } = (await repo.loadState(getPool(), profileId)).wishlist;
    expect(after).toHaveLength(MAX_MANUAL_WISHES);
    expect(after.some((w) => w.id === extra.id)).toBe(true);
  });

  it("caps how many wishlist items can be hidden", async () => {
    const profileId = await freshProfile();
    const dismissed = Array.from({ length: MAX_DISMISSED_KEYS }, (_, i) => `gap:${i}:1`);
    await repo.replaceWishlist(getPool(), profileId, { manual: [], dismissed });

    await expect(dismissWishAction("next:1:2")).rejects.toThrow(`A wishlist can hide at most ${MAX_DISMISSED_KEYS} items.`);
    await expect(dismissWishAction("gap:0:1")).resolves.toBeUndefined();
    expect((await repo.loadState(getPool(), profileId)).wishlist.dismissed).toHaveLength(MAX_DISMISSED_KEYS);
  });

  it("limits syncs per profile", async () => {
    await freshProfile();
    for (let i = 0; i < SYNC_LIMIT; i++) expect(await syncLibraryAction("demo")).toMatchObject({ ok: true });
    expect(await syncLibraryAction("demo")).toEqual({ ok: false, error: "Too many syncs. Try again in a minute." });
    // Another profile has its own budget.
    await freshProfile();
    expect(await syncLibraryAction("demo")).toMatchObject({ ok: true });
  });

  it("limits syncs per client IP before a profile exists, without calling AniList", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    request.profileId = null;
    request.forwardedFor = "203.0.113.9, 10.0.0.1";
    // Usernames AniList would never accept are refused before any request or write.
    for (let i = 0; i < SYNC_LIMIT; i++) {
      expect(await syncLibraryAction("no spaces!")).toMatchObject({ ok: false, error: expect.stringContaining("username") });
    }
    expect(await syncLibraryAction("no spaces!")).toEqual({ ok: false, error: "Too many syncs. Try again in a minute." });
    expect(await syncLibraryAction("Tester")).toEqual({ ok: false, error: "Too many syncs. Try again in a minute." });
    expect(fetchMock).not.toHaveBeenCalled();

    request.forwardedFor = "198.51.100.4";
    expect(await syncLibraryAction("no spaces!")).toMatchObject({ ok: false, error: expect.stringContaining("username") });
  });

  it("reuses an AniList response for a minute, whatever the username's case", async () => {
    const profileId = await freshProfile();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(anilistBody), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await syncLibraryAction("Tester");
    const second = await syncLibraryAction("tester");
    expect(first).toMatchObject({ ok: true, library: { user: { name: "Tester" } } });
    expect(second).toEqual(first); // same syncedAt: the cached fetch's time
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await repo.loadState(getPool(), profileId)).library?.user.name).toBe("Tester");

    libraryCache.clear();
    await syncLibraryAction("Tester");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
