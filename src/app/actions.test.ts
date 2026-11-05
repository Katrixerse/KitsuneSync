import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "@/lib/db/migrate";
import { getPool } from "@/lib/db/pool";
import * as repo from "@/lib/db/repo";
import { demoLibrary, demoShelf } from "@/lib/demo";
import { generateLinkCode, LINK_CODE_TTL_MS } from "@/lib/link-code";
import { LINK_ATTEMPT_LIMIT, SYNC_LIMIT } from "@/lib/rate-limit";
import type { ShelfSeries } from "@/lib/shelf";
import { applySync, EMPTY_STATE } from "@/lib/state";
import { libraryCache } from "@/lib/sync-cache";
import { MAX_DISMISSED_KEYS, MAX_MANUAL_WISHES, MAX_SHELF_SERIES, ValidationError } from "@/lib/validate";
import {
  addManualWishAction,
  createLinkCodeAction,
  dismissReleaseAction,
  dismissWishAction,
  importBackupAction,
  loadDemoAction,
  redeemLinkCodeAction,
  removeSeriesAction,
  syncLibraryAction,
  upsertSeriesAction,
} from "./actions";

// The actions read the profile cookie and request headers through next/headers,
// which only works inside a request, so the "request" is simulated here. A cookie
// the action sets is sent back on the next call, as a browser would.
const request = vi.hoisted(() => ({
  profileId: null as string | null,
  forwardedFor: null as string | null,
  setCookie: null as { value: string; options: Record<string, unknown> } | null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kitsune_profile" && request.profileId ? { value: request.profileId } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      if (name !== "kitsune_profile") return;
      request.profileId = value;
      request.setCookie = { value, options };
    },
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
    releasedVolumes: null,
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
    request.setCookie = null;
    return id;
  }

  const INVALID = { ok: false, error: "That code is invalid or has expired." };
  const TOO_MANY = { ok: false, error: "Too many attempts. Try again in a minute." };

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

  describe("release alerts", () => {
    const berserk = demoLibrary().manga.find((e) => e.media.title === "Berserk")!;

    it("saves the alerts a sync finds, keeps them over later syncs and drops one on dismiss", async () => {
      const profileId = await freshProfile();
      const demo = demoLibrary();
      const shelf = demoShelf(demo); // Berserk is one volume behind AniList
      await repo.replaceShelf(getPool(), profileId, shelf);

      const synced = await syncLibraryAction("demo");
      expect(synced).toMatchObject({ ok: true });
      if (!synced.ok) throw new Error("unreachable");
      const state = await repo.loadState(getPool(), profileId);
      expect(state.releases).toEqual([
        { mediaId: berserk.media.id, title: "Berserk", cover: null, color: "#861c1c", volumes: [43], releasedAt: synced.library.syncedAt },
      ]);
      expect(state.shelf[berserk.media.id]).toMatchObject({ owned: shelf[berserk.media.id].owned, totalVolumes: 43, releasedVolumes: 43 });
      // What the server saved is what the client computes from the same result.
      expect(state).toEqual(applySync({ ...EMPTY_STATE, shelf }, synced.library));

      // Nothing new on the next sync: the alert stays, with its original date.
      const again = await syncLibraryAction("demo");
      if (!again.ok) throw new Error(again.error);
      expect(again.library.syncedAt).not.toBe(synced.library.syncedAt);
      expect((await repo.loadState(getPool(), profileId)).releases).toEqual(state.releases);

      await expect(dismissReleaseAction(berserk.media.id)).resolves.toBeUndefined();
      expect((await repo.loadState(getPool(), profileId)).releases).toEqual([]);
      // Dismissed stays dismissed: the count moved on with the sync.
      expect(await syncLibraryAction("demo")).toMatchObject({ ok: true });
      expect((await repo.loadState(getPool(), profileId)).releases).toEqual([]);
    });

    it("refuses ids that aren't ids", async () => {
      await freshProfile();
      for (const input of ["1", 1.5, null, undefined, {}]) {
        await expect(dismissReleaseAction(input)).rejects.toThrow("Invalid media id.");
      }
    });

    it("seeds the demo with one alert, which goes with its series but survives an import", async () => {
      const profileId = await freshProfile();
      const state = await loadDemoAction();
      expect(state.releases).toEqual([expect.objectContaining({ title: "Berserk", volumes: [43] })]);
      expect(await repo.loadState(getPool(), profileId)).toEqual(state);

      // Importing a backup replaces the shelf and wishlist, not the alerts.
      await importBackupAction({ shelf: state.shelf, wishlist: undefined });
      expect((await repo.loadState(getPool(), profileId)).releases).toEqual(state.releases);

      await removeSeriesAction(berserk.media.id);
      const after = await repo.loadState(getPool(), profileId);
      expect(after.shelf[berserk.media.id]).toBeUndefined();
      expect(after.releases).toEqual([]);
    });
  });

  describe("link codes", () => {
    it("has nothing to link for a browser without a profile", async () => {
      request.profileId = null;
      request.setCookie = null;
      expect(await createLinkCodeAction()).toEqual({ ok: false, error: "Nothing to link yet. Sync or add something first." });
      // No profile was made along the way.
      expect(request.setCookie).toBeNull();
      expect(request.profileId).toBeNull();
    });

    it("links another browser to the profile behind a code, once", async () => {
      const source = await freshProfile();
      await repo.saveLibrary(getPool(), source, demoLibrary());
      const before = Date.now();
      const made = await createLinkCodeAction();
      expect(made).toMatchObject({ ok: true, code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/) });
      if (!made.ok) throw new Error("unreachable");
      const expiresAt = new Date(made.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + LINK_CODE_TTL_MS);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + LINK_CODE_TTL_MS);
      expect(request.setCookie).toBeNull(); // this browser already had its cookie

      // The other browser has its own profile with a shelf, and types the code sloppily.
      const other = await freshProfile();
      await repo.upsertSeries(getPool(), other, series(1));
      const linked = await redeemLinkCodeAction(made.code.toLowerCase().replace("-", " "));
      expect(linked).toMatchObject({ ok: true, state: { library: { user: { name: demoLibrary().user.name } }, shelf: {} } });
      expect(request.profileId).toBe(source);
      expect(request.setCookie).toEqual({
        value: source,
        options: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 400 * 24 * 60 * 60, path: "/" },
      });
      // What the other browser had stays on the server, just no longer shown there.
      expect((await repo.loadState(getPool(), other)).shelf[1]).toMatchObject({ title: "Series 1" });

      // Used up: the same code (now from the linked browser) is refused.
      expect(await redeemLinkCodeAction(made.code)).toEqual(INVALID);
    });

    it("links a browser that has no profile yet", async () => {
      const source = await freshProfile();
      await repo.upsertSeries(getPool(), source, series(2));
      const made = await createLinkCodeAction();
      if (!made.ok) throw new Error(made.error);

      request.profileId = null;
      request.forwardedFor = "203.0.113.77";
      const linked = await redeemLinkCodeAction(made.code);
      expect(linked).toMatchObject({ ok: true, state: { library: null, shelf: { 2: { title: "Series 2" } } } });
      expect(request.profileId).toBe(source);
    });

    it("uses up your own code without changing anything", async () => {
      const profileId = await freshProfile();
      await repo.upsertSeries(getPool(), profileId, series(3));
      const made = await createLinkCodeAction();
      if (!made.ok) throw new Error(made.error);
      // A new code retires the old one.
      const again = await createLinkCodeAction();
      if (!again.ok) throw new Error(again.error);
      expect(await redeemLinkCodeAction(made.code)).toEqual(INVALID);

      expect(await redeemLinkCodeAction(again.code)).toEqual({ ok: true, state: await repo.loadState(getPool(), profileId) });
      expect(request.setCookie).toBeNull();
      expect(request.profileId).toBe(profileId);
      expect(await redeemLinkCodeAction(again.code)).toEqual(INVALID);
    });

    it("turns down codes that aren't codes before touching anything", async () => {
      const profileId = await freshProfile();
      for (const input of ["nope", "ABCD-EFG0", "", 12345678, undefined, null]) {
        expect(await redeemLinkCodeAction(input)).toEqual({ ok: false, error: "That doesn't look like a link code." });
      }
      expect(request.profileId).toBe(profileId);
      expect(request.setCookie).toBeNull();
    });

    it("refuses an expired code", async () => {
      const source = await freshProfile();
      const code = generateLinkCode();
      await repo.createLinkCode(getPool(), source, code, new Date(Date.now() - 1000));

      const other = await freshProfile();
      expect(await redeemLinkCodeAction(code)).toEqual(INVALID);
      expect(request.profileId).toBe(other);
      expect(request.setCookie).toBeNull();
    });

    it("limits attempts per profile, and keeps a real code for later", async () => {
      const source = await freshProfile();
      const made = await createLinkCodeAction();
      if (!made.ok) throw new Error(made.error);

      const guesser = await freshProfile();
      for (let i = 0; i < LINK_ATTEMPT_LIMIT; i++) expect(await redeemLinkCodeAction("ZZZZ-ZZZZ")).toEqual(INVALID);
      expect(await redeemLinkCodeAction("ZZZZ-ZZZZ")).toEqual(TOO_MANY);
      // Even the right code is refused while the limit holds, and it is not used up by that.
      expect(await redeemLinkCodeAction(made.code)).toEqual(TOO_MANY);
      expect(request.profileId).toBe(guesser);

      await freshProfile();
      expect(await redeemLinkCodeAction(made.code)).toMatchObject({ ok: true });
      expect(request.profileId).toBe(source);
    });

    it("limits attempts per client IP before a profile exists", async () => {
      request.profileId = null;
      request.forwardedFor = "203.0.113.78, 10.0.0.1";
      for (let i = 0; i < LINK_ATTEMPT_LIMIT; i++) expect(await redeemLinkCodeAction("ZZZZ-ZZZZ")).toEqual(INVALID);
      expect(await redeemLinkCodeAction("ZZZZ-ZZZZ")).toEqual(TOO_MANY);
      expect(request.profileId).toBeNull();

      request.forwardedFor = "203.0.113.79";
      expect(await redeemLinkCodeAction("ZZZZ-ZZZZ")).toEqual(INVALID);
    });
  });
});
