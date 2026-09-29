import { getPool } from "./pool";

/**
 * Schema migrations, applied in order at server start (see src/instrumentation.ts).
 * Append new entries; never edit one that has shipped.
 */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "init",
    sql: `
      CREATE TABLE profiles (
        id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      -- Latest AniList sync, stored whole: it is replaced on every sync and only read back as a unit.
      CREATE TABLE libraries (
        profile_id uuid PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
        data jsonb NOT NULL,
        synced_at timestamptz NOT NULL
      );

      CREATE TABLE shelf_series (
        profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        media_id integer NOT NULL,
        title text NOT NULL,
        cover text,
        color text,
        site_url text,
        total_volumes integer CHECK (total_volumes BETWEEN 1 AND 200),
        owned integer[] NOT NULL DEFAULT '{}',
        edition text NOT NULL CHECK (edition IN ('standard', 'omnibus', 'deluxe', 'box-set')),
        ongoing boolean NOT NULL DEFAULT false,
        notes text NOT NULL DEFAULT '',
        added_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (profile_id, media_id)
      );

      CREATE TABLE wishlist_manual (
        profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        id uuid NOT NULL,
        title text NOT NULL,
        note text NOT NULL DEFAULT '',
        added_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (profile_id, id)
      );

      CREATE TABLE wishlist_dismissed (
        profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
        key text NOT NULL,
        PRIMARY KEY (profile_id, key)
      );
    `,
  },
];

// Arbitrary constant so concurrent server starts don't race each other.
const MIGRATION_LOCK = 4_815_162_342;

export async function migrate(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ id: number }>("SELECT id FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.id));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [migration.id, migration.name]);
        await client.query("COMMIT");
        console.log(`[db] applied migration ${migration.id}_${migration.name}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}
