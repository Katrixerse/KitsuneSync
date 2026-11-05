import { expect, test } from "@playwright/test";
import { DEMO_USER, loadDemo, pngSize } from "./helpers";

test("the health check answers while Postgres is up", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("the home page renders the sync form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "KitsuneSync" })).toBeVisible();
  await expect(page.getByLabel("AniList username")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try demo" })).toBeEnabled();
});

test("Try demo opens the dashboard with the demo ID card", async ({ page }) => {
  await loadDemo(page);
  await expect(page.getByRole("article", { name: `${DEMO_USER}'s KitsuneSync ID card` })).toBeVisible();
  await expect(page.getByRole("navigation")).toContainText(`@${DEMO_USER}`);
  await expect(page.getByRole("navigation")).toContainText("[demo]");
});

test("the ID card PNG renders for a synced profile only", async ({ page, request }) => {
  // The request fixture is its own context without the profile cookie, so there is no card to draw.
  const anonymous = await request.get("/id-card.png");
  expect(anonymous.status()).toBe(404);
  expect(anonymous.headers()["content-type"]).toContain("application/json");
  expect(await anonymous.json()).toEqual({ error: "Sync first." });

  await loadDemo(page);
  const res = await page.request.get("/id-card.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(pngSize(await res.body())).toEqual({ width: 1200, height: 630 });
});
