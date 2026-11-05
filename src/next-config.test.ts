import { describe, expect, it } from "vitest";
import nextConfig, { securityHeaders } from "../next.config";

/** The CSP as { directive: sources }. */
function csp(dev: boolean): Record<string, string[]> {
  const value = securityHeaders(dev).find((h) => h.key === "Content-Security-Policy")!.value;
  return Object.fromEntries(
    value.split("; ").map((d) => {
      const [name, ...sources] = d.split(" ");
      return [name, sources];
    }),
  );
}

describe("securityHeaders", () => {
  it("adds 'unsafe-eval' for the dev server only", () => {
    expect(csp(true)["script-src"]).toContain("'unsafe-eval'");
    expect(csp(false)["script-src"]).not.toContain("'unsafe-eval'");
    // Nothing else differs between the two.
    expect({ ...csp(true), "script-src": [] }).toEqual({ ...csp(false), "script-src": [] });
  });

  it("keeps the CSP img-src in step with images.remotePatterns", () => {
    const imgSrc = csp(false)["img-src"];
    const patterns = nextConfig.images!.remotePatterns!;
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) expect(imgSrc).toContain(`https://${(p as { hostname: string }).hostname}`);
  });

  it("applies to every route and drops x-powered-by", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/(.*)");
    expect(rules[0].headers.map((h) => h.key)).toEqual(securityHeaders(false).map((h) => h.key));
  });
});
