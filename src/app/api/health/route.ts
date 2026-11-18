import { getPool } from "@/lib/db/pool";

/**
 * Liveness probe for Docker and load balancers: 200 when Postgres answers,
 * 503 when it doesn't. Every call hits the database, nothing is cached.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("Health check failed", err);
    return Response.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
