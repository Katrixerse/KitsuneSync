import { Pool, type PoolClient } from "pg";

const globalForDb = globalThis as unknown as { kitsunePool?: Pool };

/** One pool per server process, kept across dev hot reloads. */
export function getPool(): Pool {
  if (!globalForDb.kitsunePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local or run `docker compose up`.");
    }
    globalForDb.kitsunePool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_SIZE) || 10 });
  }
  return globalForDb.kitsunePool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
