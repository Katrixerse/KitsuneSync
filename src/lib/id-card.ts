import { hashString } from "./profile";

/**
 * Bits of the ID card shared by its on-page version (components/IdCard.tsx)
 * and the PNG export (app/id-card.png), so both print the same card.
 */

export interface Bar {
  x: number;
  w: number;
}

/** Width of the barcode in bar units; callers pick the pixels per unit. */
export const BARCODE_WIDTH = 160;

/** Bars 1–3 units wide with 1–3 unit gaps, seeded so the same card always gets the same barcode. */
export function barcodeBars(seed: string): Bar[] {
  let h = hashString(seed);
  const bars: Bar[] = [];
  let x = 0;
  while (x < BARCODE_WIDTH) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const w = 1 + (h % 3);
    bars.push({ x, w });
    x += w + 1 + ((h >>> 4) % 3);
  }
  return bars;
}

/** The sync date the way the card prints it: `2026.06.01`. */
export function issuedOn(syncedAt: string): string {
  return new Date(syncedAt).toISOString().slice(0, 10).replaceAll("-", ".");
}
