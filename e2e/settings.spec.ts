import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { DEMO_USER, loadDemo, saved } from "./helpers";

test.beforeEach(async ({ page }) => {
  await loadDemo(page);
  await page.goto("/settings");
});

test("Export JSON downloads a backup of the shelf and wishlist", async ({ page }) => {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^kitsunesync-\d{4}-\d{2}-\d{2}\.json$/);

  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup).toMatchObject({ app: "kitsunesync", version: 1, user: DEMO_USER });
  // The six demo series (src/lib/demo.ts), keyed by media id.
  expect(Object.keys(backup.shelf)).toHaveLength(6);
  expect(backup.wishlist).toEqual({ manual: [], dismissed: [] });
});

test("Erase everything empties the profile and forgets the browser", async ({ page }) => {
  await expect(page.getByText(`Last synced @${DEMO_USER}`)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await saved(page, () => page.getByRole("button", { name: "Erase everything" }).click());
  await expect(page.getByText("All data erased.")).toBeVisible();
  await expect(page.getByText("Last synced")).toBeHidden();

  // The profile rows and the cookie are gone, so a full load starts from nothing.
  await page.goto("/shelf");
  await expect(page.getByRole("heading", { name: "No data jacked in yet" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Signed in as")).toBeHidden();
  await expect(page.getByRole("button", { name: "Try demo" })).toBeVisible();
  expect((await page.request.get("/id-card.png")).status()).toBe(404);
});
