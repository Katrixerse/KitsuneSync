import type { Pool, PoolClient } from "pg";

/**
 * Housekeeping for data nobody can reach any more. Runs at server start and
 * once a day (see src/instrumentation.ts). Every step is safe to repeat:
 * withProfile recreates a missing profile on the next write, and loadState
 * returns the empty state for one that is gone.
 */

type Db = Pool | PoolClient;

/** Browsers drop the profile cookie after 400 days (see lib/session.ts), so older profiles are orphaned. */
export const STALE_PROFILE_DAYS = 400;
/** Profiles that hold nothing (no library, shelf or wishlist rows) are dropped once they are a day old. */
export const EMPTY_PROFILE_DAYS = 1;

export const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Deletes stale and empty profiles (their rows cascade) and returns how many went. */
export async function cleanupProfiles(db: Db): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM profiles p
     WHERE p.updated_at < now() - make_interval(days => $1)
        OR (p.updated_at < now() - make_interval(days => $2)
            AND NOT EXISTS (SELECT 1 FROM libraries WHERE profile_id = p.id)
            AND NOT EXISTS (SELECT 1 FROM shelf_series WHERE profile_id = p.id)
            AND NOT EXISTS (SELECT 1 FROM wishlist_manual WHERE profile_id = p.id)
            AND NOT EXISTS (SELECT 1 FROM wishlist_dismissed WHERE profile_id = p.id))`,
    [STALE_PROFILE_DAYS, EMPTY_PROFILE_DAYS],
  );
  return rowCount ?? 0;
}

/** Cleanup steps in run order. Add new ones here (e.g. expired link codes); each returns the rows it removed. */
const STEPS: { name: string; run: (db: Db) => Promise<number> }[] = [{ name: "profiles", run: cleanupProfiles }];

/** Runs every step. Failures are logged and never thrown, so housekeeping can't take the server down. */
export async function runCleanup(db: Db): Promise<void> {
  for (const step of STEPS) {
    try {
      const removed = await step.run(db);
      if (removed > 0) console.log(`[db] cleanup removed ${removed} ${step.name}`);
    } catch (err) {
      console.error(`[db] cleanup of ${step.name} failed`, err);
    }
  }
}

/** Runs cleanup now and then every `intervalMs`. The timer is unref()'d so it can't keep the process alive. */
export function scheduleCleanup(db: Db, intervalMs = CLEANUP_INTERVAL_MS): NodeJS.Timeout {
  void runCleanup(db);
  return setInterval(() => void runCleanup(db), intervalMs).unref();
}
