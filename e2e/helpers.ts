import { expect, type Page } from "@playwright/test";

/** The demo profile's AniList handle (src/lib/demo.ts). */
export const DEMO_USER = "NekoRunner";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Loads the demo from the home page, which gives this browser context its own anonymous profile. */
export async function loadDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try demo" }).click();
  await page.waitForURL("/dashboard");
  await expect(page.getByRole("heading", { name: DEMO_USER })).toBeVisible();
}

/**
 * Runs `action` and waits for the Server Action it triggers to answer. The
 * store applies edits optimistically and saves in the background (a POST to
 * the current page carrying a Next-Action header), so a reload right after a
 * click could still read the old rows.
 */
export async function saved<T>(page: Page, action: () => Promise<T>): Promise<T> {
  const response = page.waitForResponse(
    (res) => res.request().method() === "POST" && "next-action" in res.request().headers(),
  );
  const result = await action();
  expect((await response).ok()).toBe(true);
  return result;
}

/** Width and height from a PNG's IHDR chunk, which follows the 8-byte signature, a 4-byte length and "IHDR". */
export function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
