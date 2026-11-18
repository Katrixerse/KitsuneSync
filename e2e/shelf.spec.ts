import { expect, test, type Page } from "@playwright/test";
import { loadDemo, saved } from "./helpers";

/** One series' card on the shelf page, found by its title. */
function seriesCard(page: Page, title: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

test.beforeEach(async ({ page }) => {
  await loadDemo(page);
  await page.goto("/shelf");
});

test("toggling a volume is saved and survives a reload", async ({ page }) => {
  // The demo shelf owns BLAME! 1–4 and 6, so volume 5 is a gap.
  const volumes = seriesCard(page, "BLAME!").getByRole("group", { name: "BLAME! volumes" });
  const vol5 = volumes.getByRole("button", { name: /^Volume 5\b/ });
  await expect(vol5).toHaveAttribute("aria-pressed", "false");
  await expect(vol5).toHaveAccessibleName("Volume 5, missing");

  await saved(page, () => vol5.click());
  await expect(vol5).toHaveAttribute("aria-pressed", "true");
  await expect(vol5).toHaveAccessibleName("Volume 5, owned");

  await page.reload();
  await expect(vol5).toHaveAttribute("aria-pressed", "true");

  await saved(page, () => vol5.click());
  await expect(vol5).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await expect(vol5).toHaveAttribute("aria-pressed", "false");
  await expect(vol5).toHaveAccessibleName("Volume 5, missing");
});

test("raising the total adds volume slots and survives a reload", async ({ page }) => {
  // Monster: 6 of 9 volumes owned in the demo shelf.
  const card = seriesCard(page, "Monster");
  const slots = card.getByRole("group", { name: "Monster volumes" }).getByRole("button");
  await expect(slots).toHaveCount(9);

  await card.getByRole("button", { name: "edit", exact: true }).click();
  const total = card.getByLabel("Total volumes");
  await expect(total).toHaveValue("9");
  await total.fill("12");
  await saved(page, () => total.blur());
  await expect(slots).toHaveCount(12);
  await expect(card).toContainText("6 / 12 vol");

  await page.reload();
  await expect(slots).toHaveCount(12);
  await expect(card).toContainText("6 / 12 vol");
});

test("adding a series by hand is saved and survives a reload", async ({ page }) => {
  await page.getByRole("button", { name: "not on AniList? add by hand" }).click();
  const form = page.locator("form").filter({ has: page.getByLabel("Title") });
  await form.getByLabel("Title").fill("Art book");
  await form.getByLabel("Total volumes").fill("3");
  await saved(page, () => form.getByRole("button", { name: "Add" }).click());

  const card = seriesCard(page, "Art book");
  await expect(card).toBeVisible();
  await expect(card.getByRole("group", { name: "Art book volumes" }).getByRole("button")).toHaveCount(3);

  await page.reload();
  await expect(seriesCard(page, "Art book")).toBeVisible();
  await expect(seriesCard(page, "Art book").getByRole("group", { name: "Art book volumes" }).getByRole("button")).toHaveCount(3);
});

test("leaving a field unchanged saves nothing", async ({ page }) => {
  const card = seriesCard(page, "Monster");
  await card.getByRole("button", { name: "edit", exact: true }).click();
  const posts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && "next-action" in req.headers()) posts.push(req.url());
  });

  const total = card.getByLabel("Total volumes");
  await expect(total).toHaveValue("9");
  await total.focus();
  await total.blur();
  const notes = card.getByLabel("Notes");
  await notes.focus();
  await notes.press("Enter");
  await notes.blur();

  // Give a stray save time to go out before deciding none did.
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
});
