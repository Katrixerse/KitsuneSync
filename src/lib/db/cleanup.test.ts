import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { demoLibrary } from "../demo";
import { EMPTY_STATE } from "../state";
import { cleanupProfiles, runCleanup, scheduleCleanup } from "./cleanup";
import { migrate } from "./migrate";
import { getPool } from "./pool";
import * as repo from "./repo";

// Runs against a real Postgres when DATABASE_URL is set (CI provides one).
describe.skipIf(!process.env.DATABASE_URL)("cleanupProfiles (Postgres)", () => {
  const stale = randomUUID(); // has data, but untouched for longer than the cookie lives
  const emptyOld = randomUUID(); // nothing saved, two days old
  const emptyFresh = randomUUID(); // nothing saved, just created
  const activeOld = randomUUID(); // has data, two days old
  const ids = [stale, emptyOld, emptyFresh, activeOld];

  beforeAll(async () => {
    await migrate();
    const db = getPool();
    // Clear whatever earlier runs left behind, so the count below is ours alone.
    await cleanupProfiles(db);
    for (const [id, days] of [[stale, 401], [emptyOld, 2], [emptyFresh, 0], [activeOld, 2]] as const) {
      await db.query(
        `INSERT INTO profiles (id, created_at, updated_at)
         VALUES ($1, now() - make_interval(days => $2), now() - make_interval(days => $2))`,
        [id, days],
      );
    }
    await repo.saveLibrary(db, stale, demoLibrary());
    await repo.saveLibrary(db, activeOld, demoLibrary());
  });

  afterAll(async () => {
    await getPool().query("DELETE FROM profiles WHERE id = ANY($1::uuid[])", [ids]);
    await getPool().end();
  });

  it("deletes stale and empty profiles and keeps the rest", async () => {
    const db = getPool();
    expect(await cleanupProfiles(db)).toBe(2);

    const { rows } = await db.query<{ id: string }>("SELECT id FROM profiles WHERE id = ANY($1::uuid[])", [ids]);
    expect(rows.map((r) => r.id).sort()).toEqual([activeOld, emptyFresh].sort());
    // The stale profile's library went with it, and a missing profile reads as empty.
    expect(await repo.loadState(db, stale)).toEqual(EMPTY_STATE);
    expect((await repo.loadState(db, activeOld)).library).not.toBeNull();

    // Nothing left to do on a second pass.
    expect(await cleanupProfiles(db)).toBe(0);
  });
});

function fakeDb(query: ReturnType<typeof vi.fn>) {
  return { db: { query } as unknown as Pool, query };
}

describe("runCleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs only when something was removed", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, query } = fakeDb(vi.fn().mockResolvedValue({ rowCount: 0 }));
    await runCleanup(db);
    expect(log).not.toHaveBeenCalled();

    query.mockResolvedValue({ rowCount: 3 });
    await runCleanup(db);
    expect(log).toHaveBeenCalledWith("[db] cleanup removed 3 profiles");
  });

  it("logs a failing step instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb(vi.fn().mockRejectedValue(new Error("connection refused")));
    await expect(runCleanup(db)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[db] cleanup of profiles failed", expect.any(Error));
  });
});

describe("scheduleCleanup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs right away and then once per interval", async () => {
    vi.useFakeTimers();
    const { db, query } = fakeDb(vi.fn().mockResolvedValue({ rowCount: 0 }));
    const timer = scheduleCleanup(db, 1000);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(query).toHaveBeenCalledTimes(3);
    clearInterval(timer);
  });

  it("doesn't keep the process alive", () => {
    const { db } = fakeDb(vi.fn().mockResolvedValue({ rowCount: 0 }));
    const timer = scheduleCleanup(db);
    expect(timer.hasRef()).toBe(false);
    clearInterval(timer);
  });
});
