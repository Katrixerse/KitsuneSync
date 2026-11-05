import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoLibrary, demoShelf } from "../demo";
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

  it("round-trips a full state", async () => {
    const library = demoLibrary();
    const shelf = demoShelf(library);
    const wishlist = {
      manual: [{ id: randomUUID(), title: "Artbook", note: "signed", addedAt: "2026-01-01T00:00:00.000Z" }],
      dismissed: ["gap:1:2"],
    };

    await withTransaction(async (db) => {
      await repo.touchProfile(db, profileId);
      await repo.saveLibrary(db, profileId, library);
      await repo.replaceShelf(db, profileId, shelf);
      await repo.replaceWishlist(db, profileId, wishlist);
    });

    expect(await repo.loadState(getPool(), profileId)).toEqual({ ...EMPTY_STATE, library, shelf, wishlist });
  });

  it("applies single-item changes", async () => {
    const db = getPool();
    const before = await repo.loadState(db, profileId);
    const [first] = Object.values(before.shelf);

    await repo.upsertSeries(db, profileId, { ...first, owned: [1, 5], notes: "shelf B" });
    await repo.dismissKey(db, profileId, "gap:1:2");
    await repo.deleteManualWish(db, profileId, before.wishlist.manual[0].id);

    const after = await repo.loadState(db, profileId);
    expect(after.shelf[first.mediaId]).toMatchObject({ owned: [1, 5], notes: "shelf B" });
    expect(after.wishlist).toEqual({ manual: [], dismissed: ["gap:1:2"] });

    await repo.deleteSeries(db, profileId, first.mediaId);
    expect((await repo.loadState(db, profileId)).shelf[first.mediaId]).toBeUndefined();
  });

  it("replaces the shelf in one batch, dropping series not in the new set", async () => {
    const db = getPool();
    const library = demoLibrary();
    const [a, b, c] = library.manga.map((e) => seriesFromEntry(e, new Date("2026-02-03T04:05:06.000Z")));
    const added = { ...a, owned: [1, 2, 3, 7], notes: "signed", edition: "deluxe" as const, cover: null };
    const other = { ...b, addedAt: "2025-12-31T23:59:59.000Z", totalVolumes: 12, ongoing: true };

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

  it("deleting a profile removes everything", async () => {
    const other = randomUUID();
    await repo.touchProfile(getPool(), other);
    await repo.saveLibrary(getPool(), other, demoLibrary());
    await repo.deleteProfile(getPool(), other);
    expect(await repo.loadState(getPool(), other)).toEqual(EMPTY_STATE);
  });
});
