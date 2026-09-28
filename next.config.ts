import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AniList serves covers and avatars from its CDN.
    remotePatterns: [{ protocol: "https", hostname: "s4.anilist.co", pathname: "/file/**" }],
  },
};

export default nextConfig;
