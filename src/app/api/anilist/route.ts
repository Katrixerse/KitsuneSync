import type { NextRequest } from "next/server";
import { AniListError, fetchLibrary } from "@/lib/anilist/client";
import { DEMO_USERNAME, demoLibrary } from "@/lib/demo";

/**
 * Proxies AniList so the browser gets one normalized payload and friendly
 * errors. Only public lists are read; no token is ever needed.
 */
export async function GET(request: NextRequest) {
  const user = request.nextUrl.searchParams.get("user")?.trim() ?? "";
  if (!user) return Response.json({ error: "Enter an AniList username." }, { status: 400 });

  if (user.toLowerCase() === DEMO_USERNAME) return Response.json(demoLibrary());

  try {
    const library = await fetchLibrary(user);
    return Response.json(library, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    if (err instanceof AniListError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("AniList sync failed", err);
    return Response.json({ error: "Couldn't reach AniList. Try again shortly." }, { status: 502 });
  }
}
