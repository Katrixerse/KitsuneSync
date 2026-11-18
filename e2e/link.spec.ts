import { expect, test, type Browser, type Page } from "@playwright/test";
import { DEMO_USER, loadDemo, saved } from "./helpers";

/** A code as Settings shows it: eight characters from the alphabet in src/lib/link-code.ts (no 0/O or 1/I), split by a dash. */
const LINK_CODE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/** Opens Settings, asks for a link code and returns the one shown. */
async function showLinkCode(page: Page): Promise<string> {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Show a link code" }).click();
  const code = (await page.getByText(LINK_CODE).innerText()).trim();
  expect(code).toMatch(LINK_CODE);
  return code;
}

/** Types a code into Settings' "Code from another device" field and submits it. */
async function redeem(page: Page, code: string) {
  await page.getByLabel("Code from another device").fill(code);
  await page.getByRole("button", { name: "Link", exact: true }).click();
}

/** A second browser context: its own cookies, so its own anonymous profile, like a phone next to the laptop. */
async function otherDevice(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** One series' card on the shelf page, found by its title. */
function seriesCard(page: Page, title: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

test("a link code opens the profile in another browser, and works only once", async ({ browser, page }) => {
  await loadDemo(page);
  const first = await showLinkCode(page);
  // New code replaces the earlier one for this profile.
  await page.getByRole("button", { name: "New code" }).click();
  const shown = page.getByText(LINK_CODE);
  await expect(shown).not.toHaveText(first);
  const code = (await shown.innerText()).trim();
  expect(code).toMatch(LINK_CODE);

  const phone = await otherDevice(browser);
  try {
    await phone.page.goto("/settings");
    await expect(phone.page.getByText("Last synced")).toBeHidden();
    await redeem(phone.page, first);
    await expect(phone.page.getByText("That code is invalid or has expired.")).toBeVisible();

    // Case, spaces and dashes don't matter when typing a code: lowercase with a space for the dash still matches.
    await redeem(phone.page, code.toLowerCase().replace("-", " "));
    await expect(phone.page.getByText(`Linked. Showing @${DEMO_USER}.`)).toBeVisible();
    await expect(phone.page.getByText(`Last synced @${DEMO_USER}`)).toBeVisible();

    // The cookie now points at the demo profile, so full loads show it too.
    await phone.page.goto("/dashboard");
    await expect(phone.page.getByRole("heading", { name: DEMO_USER })).toBeVisible();
    await expect(phone.page.getByRole("article", { name: `${DEMO_USER}'s KitsuneSync ID card` })).toBeVisible();
    await phone.page.reload();
    await expect(phone.page.getByRole("heading", { name: DEMO_USER })).toBeVisible();
    await expect(phone.page.getByRole("navigation")).toContainText(`@${DEMO_USER}`);
  } finally {
    await phone.context.close();
  }

  // Redeeming used the code up.
  const tablet = await otherDevice(browser);
  try {
    await tablet.page.goto("/settings");
    await redeem(tablet.page, code);
    await expect(tablet.page.getByText("That code is invalid or has expired.")).toBeVisible();
    await expect(tablet.page.getByText("Last synced")).toBeHidden();
  } finally {
    await tablet.context.close();
  }
});

test("a browser with nothing saved has no code to show and rejects what isn't a code", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Show a link code" }).click();
  await expect(page.getByText("Nothing to link yet. Sync or add something first.")).toBeVisible();
  await expect(page.getByText(LINK_CODE)).toBeHidden();

  await redeem(page, "nope");
  await expect(page.getByText("That doesn't look like a link code.")).toBeVisible();
});

test("linking from a browser that already has data asks first, then switches profile", async ({ browser, page }) => {
  // Make this profile recognisable: the demo shelf has BLAME! 5 missing, so own it here.
  await loadDemo(page);
  await page.goto("/shelf");
  const vol5 = seriesCard(page, "BLAME!").getByRole("button", { name: /^Volume 5\b/ });
  await expect(vol5).toHaveAccessibleName("Volume 5, missing");
  await saved(page, () => vol5.click());
  await expect(vol5).toHaveAccessibleName("Volume 5, owned");
  const code = await showLinkCode(page);

  const phone = await otherDevice(browser);
  try {
    await loadDemo(phone.page);
    await phone.page.goto("/shelf");
    const phoneVol5 = seriesCard(phone.page, "BLAME!").getByRole("button", { name: /^Volume 5\b/ });
    await expect(phoneVol5).toHaveAccessibleName("Volume 5, missing");

    await phone.page.goto("/settings");
    const dialogs: string[] = [];
    phone.page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      return dialog.accept();
    });
    await redeem(phone.page, code);
    await expect(phone.page.getByText(`Linked. Showing @${DEMO_USER}.`)).toBeVisible();
    expect(dialogs).toEqual([expect.stringContaining("This browser will switch to the linked profile.")]);

    // A full load reads the cookie: this browser now shows the first profile's shelf.
    await phone.page.goto("/shelf");
    await expect(phoneVol5).toHaveAccessibleName("Volume 5, owned");
  } finally {
    await phone.context.close();
  }
});
