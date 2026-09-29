import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone for the Docker image.
  output: "standalone",
  images: {
    // AniList serves covers and avatars from its CDN.
    remotePatterns: [{ protocol: "https", hostname: "s4.anilist.co", pathname: "/file/**" }],
  },
};

export default nextConfig;
