/** Applies database migrations once per server start, before any request is handled. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` loads this file too, and the database isn't needed (or reachable) there.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { migrate } = await import("./lib/db/migrate");
  await migrate();
}
