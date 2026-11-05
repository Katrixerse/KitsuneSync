/**
 * One-time codes for opening a profile on another device: the browser that
 * has the profile shows a code, the other one types it in (see
 * createLinkCodeAction and redeemLinkCodeAction in app/actions.ts). This
 * module is pure; storage lives in lib/db/repo.ts.
 */

/** No 0/O or 1/I, so a code read off one screen can't be mistyped on another. */
export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 8;
/** Long enough to walk over to the other device, short enough that a code left on screen isn't a standing invitation. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** Fills `bytes` with random values, as crypto.getRandomValues does. Injected in tests. */
export type RandomBytes = (bytes: Uint8Array) => Uint8Array;

/** A fresh code of LINK_CODE_LENGTH characters from the alphabet (40 bits of randomness). */
export function generateLinkCode(random: RandomBytes = (bytes) => crypto.getRandomValues(bytes)): string {
  // 32 symbols divide 256 evenly, so taking a byte modulo the alphabet size is unbiased.
  const bytes = random(new Uint8Array(LINK_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
  return code;
}

/** "ABCDEFGH" -> "ABCD-EFGH", easier to read out and to type. */
export function formatLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What the user typed, uppercased and without spaces or dashes, so "abcd-efgh" and "ABCD EFGH" both match. */
export function normalizeLinkCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}
