import type { Pool, PoolClient } from "pg";
import type { Library } from "../anilist/types";
import type { Edition, Shelf, ShelfSeries } from "../shelf";
import { EMPTY_STATE, type KitsuneState } from "../state";
import type { ManualWish, WishlistState } from "../wishlist";

/**
 * Reads and writes one profile's data. Callers pass a transaction client
 * (see withProfile in lib/session.ts) or the pool for plain reads.
 */

type Db = Pool | PoolClient;

interface ShelfRow {
  media_id: number;
  title: string;
  cover: string | null;
  color: string | null;
  site_url: string | null;
  total_volumes: number | null;
  owned: number[];
  edition: Edition;
  ongoing: boolean;
  notes: string;
  added_at: Date;
}

/** Creates the profile if needed and locks its row, so writes for one profile run one at a time. */
export async function touchProfile(db: Db, profileId: string) {
  await db.query(
    `INSERT INTO profiles (id) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    [profileId],
  );
}

export async function deleteProfile(db: Db, profileId: string) {
  await db.query("DELETE FROM profiles WHERE id = $1", [profileId]);
}

export async function loadState(db: Db, profileId: string): Promise<KitsuneState> {
  // Sequential on purpose: a single client can't run queries concurrently.
  const library = await db.query<{ data: Library }>("SELECT data FROM libraries WHERE profile_id = $1", [profileId]);
  const shelf = await db.query<ShelfRow>(
    "SELECT * FROM shelf_series WHERE profile_id = $1 ORDER BY added_at, media_id",
    [profileId],
  );
  const manual = await db.query<{ id: string; title: string; note: string; added_at: Date }>(
    "SELECT id, title, note, added_at FROM wishlist_manual WHERE profile_id = $1 ORDER BY added_at, id",
    [profileId],
  );
  const dismissed = await db.query<{ key: string }>(
    "SELECT key FROM wishlist_dismissed WHERE profile_id = $1 ORDER BY key",
    [profileId],
  );

  return {
    ...EMPTY_STATE,
    library: library.rows[0]?.data ?? null,
    shelf: Object.fromEntries(shelf.rows.map((row) => [row.media_id, rowToSeries(row)])),
    wishlist: {
      manual: manual.rows.map((row) => ({ id: row.id, title: row.title, note: row.note, addedAt: row.added_at.toISOString() })),
      dismissed: dismissed.rows.map((row) => row.key),
    },
  };
}

function rowToSeries(row: ShelfRow): ShelfSeries {
  return {
    mediaId: row.media_id,
    title: row.title,
    cover: row.cover,
    color: row.color,
    siteUrl: row.site_url,
    totalVolumes: row.total_volumes,
    owned: row.owned,
    edition: row.edition,
    ongoing: row.ongoing,
    addedAt: row.added_at.toISOString(),
    notes: row.notes,
  };
}

export async function saveLibrary(db: Db, profileId: string, library: Library | null) {
  if (!library) {
    await db.query("DELETE FROM libraries WHERE profile_id = $1", [profileId]);
    return;
  }
  await db.query(
    `INSERT INTO libraries (profile_id, data, synced_at) VALUES ($1, $2, $3)
     ON CONFLICT (profile_id) DO UPDATE SET data = EXCLUDED.data, synced_at = EXCLUDED.synced_at`,
    [profileId, JSON.stringify(library), library.syncedAt],
  );
}

export async function upsertSeries(db: Db, profileId: string, s: ShelfSeries) {
  await db.query(
    `INSERT INTO shelf_series
       (profile_id, media_id, title, cover, color, site_url, total_volumes, owned, edition, ongoing, notes, added_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (profile_id, media_id) DO UPDATE SET
       title = EXCLUDED.title, cover = EXCLUDED.cover, color = EXCLUDED.color, site_url = EXCLUDED.site_url,
       total_volumes = EXCLUDED.total_volumes, owned = EXCLUDED.owned, edition = EXCLUDED.edition,
       ongoing = EXCLUDED.ongoing, notes = EXCLUDED.notes`,
    [profileId, s.mediaId, s.title, s.cover, s.color, s.siteUrl, s.totalVolumes, s.owned, s.edition, s.ongoing, s.notes, s.addedAt],
  );
}

export async function deleteSeries(db: Db, profileId: string, mediaId: number) {
  await db.query("DELETE FROM shelf_series WHERE profile_id = $1 AND media_id = $2", [profileId, mediaId]);
}

export async function replaceShelf(db: Db, profileId: string, shelf: Shelf) {
  await db.query("DELETE FROM shelf_series WHERE profile_id = $1", [profileId]);
  for (const series of Object.values(shelf)) await upsertSeries(db, profileId, series);
}

export async function addManualWish(db: Db, profileId: string, wish: ManualWish) {
  await db.query(
    `INSERT INTO wishlist_manual (profile_id, id, title, note, added_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (profile_id, id) DO NOTHING`,
    [profileId, wish.id, wish.title, wish.note, wish.addedAt],
  );
}

export async function deleteManualWish(db: Db, profileId: string, id: string) {
  await db.query("DELETE FROM wishlist_manual WHERE profile_id = $1 AND id = $2", [profileId, id]);
}

export async function dismissKey(db: Db, profileId: string, key: string) {
  await db.query(
    "INSERT INTO wishlist_dismissed (profile_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [profileId, key],
  );
}

export async function clearDismissed(db: Db, profileId: string) {
  await db.query("DELETE FROM wishlist_dismissed WHERE profile_id = $1", [profileId]);
}

export async function replaceWishlist(db: Db, profileId: string, wishlist: WishlistState) {
  await db.query("DELETE FROM wishlist_manual WHERE profile_id = $1", [profileId]);
  await clearDismissed(db, profileId);
  for (const wish of wishlist.manual) await addManualWish(db, profileId, wish);
  for (const key of wishlist.dismissed) await dismissKey(db, profileId, key);
}
