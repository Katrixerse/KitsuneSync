import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoLibrary, demoShelf } from "../demo";
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

  it("deleting a profile removes everything", async () => {
    const other = randomUUID();
    await repo.touchProfile(getPool(), other);
    await repo.saveLibrary(getPool(), other, demoLibrary());
    await repo.deleteProfile(getPool(), other);
    expect(await repo.loadState(getPool(), other)).toEqual(EMPTY_STATE);
  });
});
