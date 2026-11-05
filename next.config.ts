import type { NextConfig } from "next";

/**
 * Response headers for every route. The CSP keeps 'unsafe-inline' because
 * Next.js boots the client with inline scripts, and next/font plus the cover
 * and progress-bar gradients (Cover.tsx, IdCard.tsx) set inline styles; a
 * nonce instead would force every page to render dynamically. React needs
 * eval for its dev-only error overlay, so 'unsafe-eval' is added outside
 * production only.
 */
export function securityHeaders(dev: boolean): { key: string; value: string }[] {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Covers and avatars come from the AniList CDN (also through /_next/image).
    "img-src 'self' data: blob: https://s4.anilist.co",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  return [
    { key: "Content-Security-Policy", value: csp.join("; ") },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone for the Docker image.
  output: "standalone",
  poweredByHeader: false,
  images: {
    // AniList serves covers and avatars from its CDN.
    remotePatterns: [{ protocol: "https", hostname: "s4.anilist.co", pathname: "/file/**" }],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
};

export default nextConfig;
