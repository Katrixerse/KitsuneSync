import { describe, expect, it } from "vitest";
import {
  formatLinkCode,
  generateLinkCode,
  LINK_CODE_ALPHABET,
  LINK_CODE_LENGTH,
  LINK_CODE_TTL_MS,
  normalizeLinkCode,
} from "./link-code";

describe("generateLinkCode", () => {
  it("makes codes of the right length from the alphabet only", () => {
    expect(LINK_CODE_LENGTH).toBe(8);
    expect(LINK_CODE_TTL_MS).toBe(10 * 60 * 1000);
    for (let i = 0; i < 50; i++) {
      const code = generateLinkCode();
      expect(code).toHaveLength(LINK_CODE_LENGTH);
      expect([...code].every((c) => LINK_CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  it("leaves out the letters and digits that look alike", () => {
    expect(LINK_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(LINK_CODE_ALPHABET).size).toBe(32);
    for (const c of "0O1I") expect(LINK_CODE_ALPHABET).not.toContain(c);
    expect(LINK_CODE_ALPHABET).toBe(LINK_CODE_ALPHABET.toUpperCase());
  });

  it("maps random bytes onto the alphabet without bias", () => {
    // Every byte value lands on exactly one symbol, and 256 is a multiple of 32, so no symbol is favoured.
    expect(256 % LINK_CODE_ALPHABET.length).toBe(0);
    expect(generateLinkCode((bytes) => bytes.map((_, i) => i))).toBe("ABCDEFGH");
    expect(generateLinkCode((bytes) => bytes.fill(31))).toBe("99999999");
    expect(generateLinkCode((bytes) => bytes.fill(32))).toBe("AAAAAAAA");
    expect(generateLinkCode((bytes) => bytes.fill(255))).toBe("99999999");
  });

  it("doesn't repeat itself", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateLinkCode()));
    expect(codes.size).toBe(200);
  });
});

describe("formatLinkCode", () => {
  it("splits a code in two groups of four", () => {
    expect(formatLinkCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });
});

describe("normalizeLinkCode", () => {
  it.each([
    ["ABCD-EFGH", "ABCDEFGH"],
    ["abcd-efgh", "ABCDEFGH"],
    ["abcd efgh", "ABCDEFGH"],
    ["  ab cd-ef gh\n", "ABCDEFGH"],
    ["ABCDEFGH", "ABCDEFGH"],
    ["", ""],
  ])("turns %j into %j", (input, expected) => {
    expect(normalizeLinkCode(input)).toBe(expected);
  });

  it("round-trips a formatted code", () => {
    const code = generateLinkCode();
    expect(normalizeLinkCode(formatLinkCode(code))).toBe(code);
  });
});
