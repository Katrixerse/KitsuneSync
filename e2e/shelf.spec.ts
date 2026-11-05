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
