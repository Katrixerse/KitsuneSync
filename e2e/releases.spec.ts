import { expect, test } from "@playwright/test";
import { DEMO_USER, loadDemo, saved } from "./helpers";

test("the demo's release alert names Berserk vol. 43, and Dismiss removes it for good", async ({ page }) => {
  await loadDemo(page);

  // The demo shelf was last synced one Berserk volume ago (src/lib/demo.ts), so loading it raises one alert.
  const releases = page.getByRole("region", { name: "New releases" });
  await expect(releases).toBeVisible();
  await expect(releases.getByRole("listitem")).toHaveCount(1);
  await expect(releases).toContainText("Berserk");
  await expect(releases).toContainText("Vol. 43 is out");

  await saved(page, () => releases.getByRole("button", { name: "Dismiss" }).click());
  await expect(releases).toBeHidden();

  // The dashboard renders from one state, so once the ID card is back the region would be too, had the dismissal not been saved.
  await page.reload();
  await expect(page.getByRole("heading", { name: DEMO_USER })).toBeVisible();
  await expect(releases).toBeHidden();
  await expect(page.getByText("Vol. 43 is out")).toBeHidden();

  // The total followed AniList's count (42 → 43) because nobody had typed one by hand.
  await page.goto("/shelf");
  const berserk = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Berserk", exact: true }) });
  await expect(berserk).toContainText("38 / 43 vol");
});
