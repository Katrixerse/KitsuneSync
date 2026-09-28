import type { AniListUser, Library, ListEntry, ListStatus, Media, MediaStatus, MediaType } from "./types";

export const ANILIST_ENDPOINT = "https://graphql.anilist.co";

const LIST_FIELDS = `
  user { id name avatar { large } bannerImage siteUrl }
  lists {
    isCustomList
    entries {
      id status progress progressVolumes repeat updatedAt
      score(format: POINT_10_DECIMAL)
      completedAt { year month day }
      media {
        id idMal type format status episodes chapters volumes duration
        averageScore genres countryOfOrigin siteUrl
        title { userPreferred native }
        coverImage { large color }
        startDate { year }
      }
    }
  }
`;

export const LIBRARY_QUERY = `
query Library($userName: String) {
  anime: MediaListCollection(userName: $userName, type: ANIME) { ${LIST_FIELDS} }
  manga: MediaListCollection(userName: $userName, type: MANGA) { ${LIST_FIELDS} }
}`;

/** AniList usernames are 2-20 characters of letters, digits, `_` and `-`. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{2,20}$/;

interface RawDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

interface RawMedia {
  id: number;
  idMal: number | null;
  type: MediaType;
  format: string | null;
  status: MediaStatus | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  duration: number | null;
  averageScore: number | null;
  genres: string[] | null;
  countryOfOrigin: string | null;
  siteUrl: string;
  title: { userPreferred: string; native: string | null };
  coverImage: { large: string | null; color: string | null } | null;
  startDate: { year: number | null } | null;
}

interface RawEntry {
  id: number;
  status: ListStatus;
  score: number | null;
  progress: number | null;
  progressVolumes: number | null;
  repeat: number | null;
  updatedAt: number | null;
  completedAt: RawDate | null;
  media: RawMedia;
}

interface RawCollection {
  user: {
    id: number;
    name: string;
    avatar: { large: string | null } | null;
    bannerImage: string | null;
    siteUrl: string;
  };
  lists: { isCustomList: boolean; entries: RawEntry[] }[];
}

export interface RawLibraryResponse {
  data?: { anime: RawCollection | null; manga: RawCollection | null } | null;
  errors?: { message: string; status?: number }[];
}

export class AniListError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AniListError";
  }
}

function formatDate(date: RawDate | null): string | null {
  if (!date?.year) return null;
  const pad = (n: number | null) => String(n ?? 1).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function normalizeMedia(raw: RawMedia): Media {
  return {
    id: raw.id,
    idMal: raw.idMal,
    type: raw.type,
    format: raw.format,
    status: raw.status,
    episodes: raw.episodes,
    chapters: raw.chapters,
    volumes: raw.volumes,
    duration: raw.duration,
    averageScore: raw.averageScore,
    genres: raw.genres ?? [],
    country: raw.countryOfOrigin,
    siteUrl: raw.siteUrl,
    title: raw.title.userPreferred,
    titleNative: raw.title.native,
    cover: raw.coverImage?.large ?? null,
    color: raw.coverImage?.color ?? null,
    year: raw.startDate?.year ?? null,
  };
}

/**
 * Flattens a collection into one entry per media. Custom lists repeat entries
 * that already live in a status list, so they are skipped.
 */
export function normalizeEntries(collection: RawCollection | null): ListEntry[] {
  if (!collection) return [];
  const seen = new Set<number>();
  const entries: ListEntry[] = [];
  for (const list of collection.lists) {
    if (list.isCustomList) continue;
    for (const raw of list.entries) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      entries.push({
        id: raw.id,
        status: raw.status,
        score: raw.score ?? 0,
        progress: raw.progress ?? 0,
        progressVolumes: raw.progressVolumes,
        repeat: raw.repeat ?? 0,
        updatedAt: raw.updatedAt ?? 0,
        completedAt: formatDate(raw.completedAt),
        media: normalizeMedia(raw.media),
      });
    }
  }
  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function normalizeLibrary(response: RawLibraryResponse, now = new Date()): Library {
  const anime = response.data?.anime ?? null;
  const manga = response.data?.manga ?? null;
  const rawUser = anime?.user ?? manga?.user;
  if (!rawUser) throw new AniListError("AniList returned no user for that name.", 404);
  const user: AniListUser = {
    id: rawUser.id,
    name: rawUser.name,
    avatar: rawUser.avatar?.large ?? null,
    banner: rawUser.bannerImage,
    siteUrl: rawUser.siteUrl,
  };
  return {
    user,
    anime: normalizeEntries(anime),
    manga: normalizeEntries(manga),
    syncedAt: now.toISOString(),
  };
}

/** Fetches a public AniList profile's anime and manga lists. */
export async function fetchLibrary(userName: string): Promise<Library> {
  if (!USERNAME_PATTERN.test(userName)) {
    throw new AniListError("That doesn't look like an AniList username.", 400);
  }
  const res = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: LIBRARY_QUERY, variables: { userName } }),
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new AniListError("AniList is rate limiting us. Try again in a minute.", 429);
  }
  const body = (await res.json().catch(() => ({}))) as RawLibraryResponse;
  if (body.errors?.length && !body.data?.anime && !body.data?.manga) {
    const first = body.errors[0];
    const status = first.status ?? res.status;
    const message =
      status === 404
        ? `No AniList user named "${userName}".`
        : first.message.toLowerCase().includes("private")
          ? `${userName}'s lists are private.`
          : first.message;
    throw new AniListError(message, status === 404 ? 404 : status || 502);
  }
  if (!res.ok) throw new AniListError(`AniList responded with ${res.status}.`, 502);
  return normalizeLibrary(body);
}
