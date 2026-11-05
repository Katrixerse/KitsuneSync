import { expect, test } from "@playwright/test";
import { loadDemo, saved } from "./helpers";

test("hiding an item is saved, and Restore brings it back", async ({ page }) => {
  await loadDemo(page);
  await page.goto("/wishlist");

  // Only auto-generated items have a Hide button; the nav's list items don't.
  const hide = page.getByRole("button", { name: "Hide", exact: true });
  const cards = page.getByRole("listitem").filter({ has: hide });
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  const first = await cards.first().innerText();
  const restore = page.getByRole("button", { name: "Restore 1 hidden" });
  await expect(restore).toBeHidden();

  await saved(page, () => hide.first().click());
  await expect(cards).toHaveCount(count - 1);
  expect(await cards.allInnerTexts()).not.toContain(first);
  await expect(restore).toBeVisible();

  await page.reload();
  await expect(cards).toHaveCount(count - 1);
  expect(await cards.allInnerTexts()).not.toContain(first);
  await expect(restore).toBeVisible();

  await saved(page, () => restore.click());
  await expect(cards).toHaveCount(count);
  expect(await cards.allInnerTexts()).toContain(first);
  await expect(restore).toBeHidden();

  await page.reload();
  await expect(cards).toHaveCount(count);
  await expect(restore).toBeHidden();
});
