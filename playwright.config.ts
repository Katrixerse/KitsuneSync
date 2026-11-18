import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests (e2e/*.spec.ts) against a production build on port
 * 3200, with DATABASE_URL pointing at a reachable Postgres. CI builds in an
 * earlier step, so there the server is only started; locally the build runs
 * first. Every test gets a fresh browser context, and with it a fresh
 * anonymous profile, so tests never see each other's rows.
 */

const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  // One worker: the suite is small, and a serial run keeps failures easy to read.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next start` warns about `output: standalone` (next.config.ts) but serves the same build; the
    // standalone server.js would need .next/static copied next to it first, as the Dockerfile does.
    command: CI ? `npm start -- --port ${PORT}` : `npm run build && npm start -- --port ${PORT}`,
    // /api/health answers 503 until Postgres is reachable, so this waits for the database too.
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
