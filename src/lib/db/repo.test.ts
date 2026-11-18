import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoLibrary, demoShelf } from "../demo";
import { generateLinkCode } from "../link-code";
import type { ReleaseAlert } from "../releases";
import { seriesFromEntry } from "../shelf";
import { EMPTY_STATE } from "../state";
import { migrate } from "./migrate";
import { getPool, withTransaction } from "./pool";
import * as repo from "./repo";

// Runs against a real Postgres when DATABASE_URL is set (CI provides one).
describe.skipIf(!process.env.DATABASE_URL)("repo (Postgres)", () => {
  const profileId = randomUUID();

  beforeAll(async () => {
    await migrate();
    await migrate(); // idempotent
  });

  afterAll(async () => {
    await repo.deleteProfile(getPool(), profileId);
    await getPool().end();
  });

  function alert(mediaId: number, volumes: number[], releasedAt: string): ReleaseAlert {
    return { mediaId, title: `Series ${mediaId}`, cover: null, color: null, volumes, releasedAt };
  }

  it("round-trips a full state", async () => {
    const library = demoLibrary();
    // Includes a known count (Berserk) and an unknown one (Chainsaw Man).
    const shelf = demoShelf(library);
    const wishlist = {
      manual: [{ id: randomUUID(), title: "Artbook", note: "signed", addedAt: "2026-01-01T00:00:00.000Z" }],
      dismissed: ["gap:1:2"],
    };
    const releases = [
      alert(950_001, [43], "2026-06-02T00:00:00.000Z"),
      { ...alert(950_003, [11, 12], "2026-06-01T00:00:00.000Z"), cover: "https://s4.anilist.co/file/x.jpg", color: "#5d6770" },
      alert(950_007, [19], "2026-06-01T00:00:00.000Z"),
    ];

    await withTransaction(async (db) => {
      await repo.touchProfile(db, profileId);
      await repo.saveLibrary(db, profileId, library);
      await repo.replaceShelf(db, profileId, shelf);
      await repo.replaceWishlist(db, profileId, wishlist);
      // Stored in a different order than they are read back: newest first, then by media id.
      await repo.replaceReleases(db, profileId, [releases[2], releases[0], releases[1]]);
    });

    expect(await repo.loadState(getPool(), profileId)).toEqual({ ...EMPTY_STATE, library, shelf, wishlist, releases });
    expect(Object.values(shelf).map((s) => s.releasedVolumes)).toEqual(expect.arrayContaining([42, null]));
  });

  it("applies single-item changes", async () => {
    const db = getPool();
    // Seeded here rather than taken from the test above, so this one also passes on its own.
    const [first] = demoLibrary().manga.map((e) => seriesFromEntry(e));
    const wish = { id: randomUUID(), title: "Artbook", note: "signed", addedAt: "2026-01-01T00:00:00.000Z" };
    await repo.replaceShelf(db, profileId, { [first.mediaId]: first });
    await repo.replaceWishlist(db, profileId, { manual: [wish], dismissed: [] });

    await repo.upsertSeries(db, profileId, { ...first, owned: [1, 5], notes: "shelf B" });
    await repo.dismissKey(db, profileId, "gap:1:2");
    await repo.deleteManualWish(db, profileId, wish.id);

    const after = await repo.loadState(db, profileId);
    expect(after.shelf[first.mediaId]).toMatchObject({ owned: [1, 5], notes: "shelf B" });
    expect(after.wishlist).toEqual({ manual: [], dismissed: ["gap:1:2"] });

    await repo.deleteSeries(db, profileId, first.mediaId);
    expect((await repo.loadState(db, profileId)).shelf[first.mediaId]).toBeUndefined();
  });

  describe("release alerts", () => {
    it("drops one alert when dismissed, and a series' alert with the series", async () => {
      const db = getPool();
      const [a, b] = demoLibrary().manga.map((e) => seriesFromEntry(e));
      await repo.replaceShelf(db, profileId, { [a.mediaId]: a, [b.mediaId]: b });
      await repo.replaceReleases(db, profileId, [alert(a.mediaId, [7], "2026-06-01T00:00:00.000Z"), alert(b.mediaId, [44], "2026-06-01T00:00:00.000Z")]);

      await repo.dismissRelease(db, profileId, a.mediaId);
      expect((await repo.loadState(db, profileId)).releases).toEqual([alert(b.mediaId, [44], "2026-06-01T00:00:00.000Z")]);
      // Dismissing again, or an alert that never existed, is fine.
      await repo.dismissRelease(db, profileId, a.mediaId);
      await repo.dismissRelease(db, profileId, -42);

      await repo.deleteSeries(db, profileId, b.mediaId);
      const after = await repo.loadState(db, profileId);
      expect(after.shelf[b.mediaId]).toBeUndefined();
      expect(after.releases).toEqual([]);
      expect(after.shelf[a.mediaId]).toEqual(a);
    });

    it("replaces the alerts in one batch", async () => {
      const db = getPool();
      const alerts = [alert(3, [1], "2026-06-03T00:00:00.000Z"), alert(1, [2, 3], "2026-06-02T00:00:00.000Z"), alert(2, [9], "2026-06-01T00:00:00.000Z")];
      await repo.replaceReleases(db, profileId, alerts);
      expect((await repo.loadState(db, profileId)).releases).toEqual(alerts);

      await repo.replaceReleases(db, profileId, [{ ...alerts[1], volumes: [2, 3, 4] }]);
      expect((await repo.loadState(db, profileId)).releases).toEqual([{ ...alerts[1], volumes: [2, 3, 4] }]);

      await repo.replaceReleases(db, profileId, []);
      expect((await repo.loadState(db, profileId)).releases).toEqual([]);
    });

    it("prunes the alerts for series outside a kept set", async () => {
      const db = getPool();
      const alerts = [alert(3, [1], "2026-06-03T00:00:00.000Z"), alert(1, [2], "2026-06-02T00:00:00.000Z"), alert(2, [9], "2026-06-01T00:00:00.000Z")];
      await repo.replaceReleases(db, profileId, alerts);

      await repo.pruneReleases(db, profileId, [1, 3, 42]);
      expect((await repo.loadState(db, profileId)).releases).toEqual([alerts[0], alerts[1]]);
      // Keeping nothing leaves nothing.
      await repo.pruneReleases(db, profileId, []);
      expect((await repo.loadState(db, profileId)).releases).toEqual([]);
    });

    it("go with their profile", async () => {
      const db = getPool();
      const other = randomUUID();
      await repo.touchProfile(db, other);
      await repo.replaceReleases(db, other, [alert(1, [2], "2026-06-01T00:00:00.000Z")]);
      expect((await repo.loadState(db, other)).releases).toHaveLength(1);
      await repo.deleteProfile(db, other);
      expect((await repo.loadState(db, other)).releases).toEqual([]);
    });
  });

  it("replaces the shelf in one batch, dropping series not in the new set", async () => {
    const db = getPool();
    const library = demoLibrary();
    const [a, b, c] = library.manga.map((e) => seriesFromEntry(e, new Date("2026-02-03T04:05:06.000Z")));
    const added = { ...a, owned: [1, 2, 3, 7], notes: "signed", edition: "deluxe" as const, cover: null };
    const other = { ...b, addedAt: "2025-12-31T23:59:59.000Z", totalVolumes: 12, releasedVolumes: 11, ongoing: true };

    await repo.replaceShelf(db, profileId, { [added.mediaId]: added, [other.mediaId]: other, [c.mediaId]: c });
    const first = await repo.loadState(db, profileId);
    expect(Object.keys(first.shelf)).toHaveLength(3);
    expect(first.shelf[added.mediaId]).toEqual(added);
    expect(first.shelf[other.mediaId]).toEqual(other);
    expect(first.shelf[c.mediaId]).toEqual(c);

    await repo.replaceShelf(db, profileId, { [c.mediaId]: { ...c, owned: [1] } });
    const second = await repo.loadState(db, profileId);
    expect(Object.keys(second.shelf)).toEqual([String(c.mediaId)]);
    expect(second.shelf[c.mediaId].owned).toEqual([1]);

    await repo.replaceShelf(db, profileId, {});
    expect((await repo.loadState(db, profileId)).shelf).toEqual({});
  });

  it("replaces the wishlist in one batch per table", async () => {
    const db = getPool();
    const manual = [
      { id: randomUUID(), title: "Artbook", note: "", addedAt: "2026-01-01T00:00:00.000Z" },
      { id: randomUUID(), title: "Box set", note: "vol. 1-6", addedAt: "2026-01-02T00:00:00.000Z" },
      { id: randomUUID(), title: "Figure", note: "", addedAt: "2026-01-03T00:00:00.000Z" },
    ];
    const dismissed = ["gap:1:2", "next:2:3", "start:3"];

    await repo.replaceWishlist(db, profileId, { manual, dismissed });
    expect((await repo.loadState(db, profileId)).wishlist).toEqual({ manual, dismissed });

    await repo.replaceWishlist(db, profileId, { manual: [manual[1]], dismissed: ["next:2:3", "planning:9"] });
    expect((await repo.loadState(db, profileId)).wishlist).toEqual({
      manual: [manual[1]],
      dismissed: ["next:2:3", "planning:9"],
    });

    await repo.replaceWishlist(db, profileId, { manual: [], dismissed: [] });
    expect((await repo.loadState(db, profileId)).wishlist).toEqual({ manual: [], dismissed: [] });
  });

  it("counts rows for the size caps, leaving out the one being written", async () => {
    const db = getPool();
    const library = demoLibrary();
    const [a, b] = library.manga.map((e) => seriesFromEntry(e));
    const wish = { id: randomUUID(), title: "Artbook", note: "", addedAt: "2026-01-01T00:00:00.000Z" };
    await repo.replaceShelf(db, profileId, { [a.mediaId]: a, [b.mediaId]: b });
    await repo.replaceWishlist(db, profileId, { manual: [wish], dismissed: ["gap:1:2", "gap:1:3"] });

    expect(await repo.countSeries(db, profileId)).toBe(2);
    expect(await repo.countSeries(db, profileId, a.mediaId)).toBe(1); // updating a: not a new row
    expect(await repo.countSeries(db, profileId, -42)).toBe(2); // a hand-added series would be new

    expect(await repo.countManualWishes(db, profileId)).toBe(1);
    expect(await repo.countManualWishes(db, profileId, wish.id)).toBe(0);
    expect(await repo.countManualWishes(db, profileId, randomUUID())).toBe(1);

    expect(await repo.countDismissed(db, profileId)).toBe(2);
    expect(await repo.countDismissed(db, profileId, "gap:1:2")).toBe(1);
    expect(await repo.countDismissed(db, profileId, "gap:9:9")).toBe(2);

    expect(await repo.countSeries(db, randomUUID())).toBe(0);
  });

  // Codes are primary keys on a table every test run shares, so they are generated rather than fixed: a run
  // that stops before afterAll can't make the next one collide.
  describe("link codes", () => {
    const inTenMinutes = () => new Date(Date.now() + 10 * 60 * 1000);

    it("keeps one code per profile and hands it out once", async () => {
      const db = getPool();
      const [first, second, unknown] = [generateLinkCode(), generateLinkCode(), generateLinkCode()];
      await repo.createLinkCode(db, profileId, first, inTenMinutes());
      await repo.createLinkCode(db, profileId, second, inTenMinutes());
      // Making a new code retires the old one.
      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, first))).toBeNull();

      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, second))).toBe(profileId);
      // Used up: the second redemption finds nothing.
      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, second))).toBeNull();
      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, unknown))).toBeNull();
    });

    it("ignores an expired code", async () => {
      const db = getPool();
      const code = generateLinkCode();
      // `now` is passed in rather than letting the row expire for real: the cleanup suite runs alongside and
      // deletes every expired row in the table, which would make "still there" a matter of timing.
      await repo.createLinkCode(db, profileId, code, inTenMinutes());
      const later = new Date(Date.now() + 11 * 60_000);
      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, code, later))).toBeNull();
      // A refused redemption leaves the row in place.
      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, code))).toBe(profileId);
    });

    it("rolls a redemption back with its transaction", async () => {
      const db = getPool();
      const code = generateLinkCode();
      await repo.createLinkCode(db, profileId, code, inTenMinutes());
      await expect(
        withTransaction(async (tx) => {
          expect(await repo.consumeLinkCode(tx, code)).toBe(profileId);
          throw new Error("later step failed");
        }),
      ).rejects.toThrow("later step failed");
      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, code))).toBe(profileId);
    });

    it("waits for the profile row instead of deadlocking with a new code for the same profile", async () => {
      const db = getPool();
      const [code, replacement] = [generateLinkCode(), generateLinkCode()];
      await repo.createLinkCode(db, profileId, code, inTenMinutes());
      let redeeming!: Promise<string | null>;
      await withTransaction(async (owner) => {
        // The owner asks for a new code: withProfile locks the profile row first...
        await repo.touchProfile(owner, profileId);
        // ...while another device redeems the old one. Holding the code row and waiting for the profile row
        // here would deadlock with the delete below; instead the redemption waits for the profile row.
        redeeming = withTransaction((tx) => repo.consumeLinkCode(tx, code));
        await new Promise((resolve) => setTimeout(resolve, 100));
        await repo.createLinkCode(owner, profileId, replacement, inTenMinutes());
      });
      // Replaced before it could be claimed: refused, not an error.
      expect(await redeeming).toBeNull();
      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, replacement))).toBe(profileId);
    });

    it("drops expired codes", async () => {
      const db = getPool();
      const other = randomUUID();
      await repo.touchProfile(db, other);
      const [expired, live] = [generateLinkCode(), generateLinkCode()];
      try {
        await repo.createLinkCode(db, profileId, expired, new Date(Date.now() - 1000));
        await repo.createLinkCode(db, other, live, inTenMinutes());
        // Checked by code, not by the returned count: the other Postgres suites' expired codes would add to it.
        await repo.deleteExpiredLinkCodes(db);
        // Gone, not merely unusable: a clock from before the expiry finds nothing either.
        expect(await withTransaction((tx) => repo.consumeLinkCode(tx, expired, new Date(0)))).toBeNull();
        expect(await withTransaction((tx) => repo.consumeLinkCode(tx, live))).toBe(other);
      } finally {
        await repo.deleteProfile(db, other);
      }
    });

    it("goes with its profile", async () => {
      const db = getPool();
      const other = randomUUID();
      const code = generateLinkCode();
      await repo.touchProfile(db, other);
      await repo.createLinkCode(db, other, code, inTenMinutes());
      await repo.deleteProfile(db, other);
      expect(await withTransaction((tx) => repo.consumeLinkCode(tx, code))).toBeNull();
    });
  });

  it("deleting a profile removes everything", async () => {
    const other = randomUUID();
    await repo.touchProfile(getPool(), other);
    await repo.saveLibrary(getPool(), other, demoLibrary());
    await repo.deleteProfile(getPool(), other);
    expect(await repo.loadState(getPool(), other)).toEqual(EMPTY_STATE);
  });
});
