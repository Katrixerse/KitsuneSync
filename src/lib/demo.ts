import type { Library, ListEntry, ListStatus, MediaStatus, MediaType } from "./anilist/types";
import { ownFirst, addVolumes, seriesFromEntry, type Shelf } from "./shelf";

/**
 * A hand-made sample library for trying the app without an AniList account.
 * Ids are local to the demo; links go to an AniList search for the title.
 */

type Row = [
  title: string,
  status: ListStatus,
  score: number,
  progress: number,
  total: number | null,
  genres: string[],
  year: number,
  extra?: {
    format?: string;
    mediaStatus?: MediaStatus;
    volumes?: number | null;
    progressVolumes?: number;
    country?: string;
    community?: number;
    duration?: number;
    color?: string;
  },
];

const ANIME: Row[] = [
  ["Cyberpunk: Edgerunners", "COMPLETED", 9.5, 10, 10, ["Action", "Drama", "Sci-Fi"], 2022, { community: 86, color: "#f9f002" }],
  ["Cowboy Bebop", "COMPLETED", 10, 26, 26, ["Action", "Adventure", "Drama", "Sci-Fi"], 1998, { community: 86, color: "#e4a15d" }],
  ["Ghost in the Shell", "COMPLETED", 9, 1, 1, ["Action", "Mecha", "Psychological", "Sci-Fi"], 1995, { format: "MOVIE", duration: 83, community: 80 }],
  ["Akira", "COMPLETED", 8.5, 1, 1, ["Action", "Horror", "Sci-Fi"], 1988, { format: "MOVIE", duration: 124, community: 81 }],
  ["Serial Experiments Lain", "COMPLETED", 9, 13, 13, ["Drama", "Mystery", "Psychological", "Sci-Fi"], 1998, { community: 79 }],
  ["Neon Genesis Evangelion", "COMPLETED", 8, 26, 26, ["Action", "Drama", "Mecha", "Psychological", "Sci-Fi"], 1995, { community: 83 }],
  ["Steins;Gate", "COMPLETED", 9.5, 24, 24, ["Drama", "Psychological", "Sci-Fi", "Thriller"], 2011, { community: 90 }],
  ["Psycho-Pass", "COMPLETED", 8, 22, 22, ["Action", "Psychological", "Sci-Fi", "Thriller"], 2012, { community: 80 }],
  ["Ergo Proxy", "DROPPED", 5, 9, 23, ["Mystery", "Psychological", "Sci-Fi"], 2006, { community: 76 }],
  ["Ghost in the Shell: Stand Alone Complex", "COMPLETED", 9, 26, 26, ["Action", "Mecha", "Mystery", "Sci-Fi"], 2002, { community: 83 }],
  ["Frieren: Beyond Journey's End", "COMPLETED", 10, 28, 28, ["Adventure", "Drama", "Fantasy"], 2023, { community: 91, color: "#9fd6e4" }],
  ["Chainsaw Man", "COMPLETED", 8, 12, 12, ["Action", "Comedy", "Horror", "Supernatural"], 2022, { community: 84 }],
  ["Mushishi", "PAUSED", 9, 14, 26, ["Adventure", "Mystery", "Slice of Life", "Supernatural"], 2005, { community: 84 }],
  ["Trigun", "COMPLETED", 7.5, 26, 26, ["Action", "Adventure", "Comedy", "Sci-Fi"], 1998, { community: 78 }],
  ["Paprika", "COMPLETED", 8.5, 1, 1, ["Mystery", "Psychological", "Sci-Fi"], 2006, { format: "MOVIE", duration: 90, community: 79 }],
  ["Space Dandy", "CURRENT", 7.5, 18, 26, ["Comedy", "Sci-Fi"], 2014, { community: 79 }],
  ["Dan Da Dan", "CURRENT", 8.5, 9, 12, ["Action", "Comedy", "Romance", "Sci-Fi", "Supernatural"], 2024, { community: 84 }],
  ["Made in Abyss", "PLANNING", 0, 0, 13, ["Adventure", "Drama", "Fantasy", "Mystery", "Sci-Fi"], 2017, { community: 85 }],
  ["Texhnolyze", "PLANNING", 0, 0, 22, ["Drama", "Psychological", "Sci-Fi"], 2003, { community: 76 }],
  ["Planetes", "PLANNING", 0, 0, 26, ["Drama", "Romance", "Sci-Fi"], 2003, { community: 82 }],
  ["Sonny Boy", "DROPPED", 5, 4, 12, ["Mystery", "Sci-Fi", "Supernatural"], 2021, { community: 74 }],
];

const MANGA: Row[] = [
  ["Akira", "COMPLETED", 10, 120, 120, ["Action", "Horror", "Sci-Fi"], 1982, { volumes: 6, progressVolumes: 6, community: 88 }],
  ["Berserk", "CURRENT", 9.5, 374, null, ["Action", "Drama", "Fantasy", "Horror"], 1989, { mediaStatus: "RELEASING", volumes: null, progressVolumes: 42, community: 93, color: "#861c1c" }],
  ["Ghost in the Shell", "COMPLETED", 8, 11, 11, ["Action", "Mecha", "Psychological", "Sci-Fi"], 1989, { volumes: 1, progressVolumes: 1, community: 76 }],
  ["BLAME!", "COMPLETED", 9, 65, 65, ["Action", "Horror", "Mystery", "Sci-Fi"], 1997, { volumes: 10, progressVolumes: 10, community: 80, color: "#5d6770" }],
  ["Pluto", "COMPLETED", 9, 65, 65, ["Drama", "Mystery", "Psychological", "Sci-Fi"], 2003, { volumes: 8, progressVolumes: 8, community: 86 }],
  ["Chainsaw Man", "CURRENT", 8.5, 190, null, ["Action", "Comedy", "Horror", "Supernatural"], 2018, { mediaStatus: "RELEASING", volumes: null, progressVolumes: 20, community: 85, color: "#e9522c" }],
  ["Vagabond", "PAUSED", 9.5, 327, null, ["Action", "Adventure", "Drama", "Psychological"], 1998, { mediaStatus: "HIATUS", volumes: null, progressVolumes: 37, community: 91 }],
  ["Monster", "COMPLETED", 9, 162, 162, ["Drama", "Mystery", "Psychological", "Thriller"], 1994, { volumes: 18, progressVolumes: 18, community: 89 }],
  ["Dorohedoro", "COMPLETED", 8.5, 167, 167, ["Action", "Comedy", "Fantasy", "Horror"], 2000, { volumes: 23, progressVolumes: 23, community: 84 }],
  ["Battle Angel Alita", "COMPLETED", 8, 51, 51, ["Action", "Drama", "Sci-Fi"], 1990, { volumes: 9, progressVolumes: 9, community: 79 }],
  ["Oyasumi Punpun", "COMPLETED", 8.5, 147, 147, ["Drama", "Psychological", "Slice of Life"], 2007, { volumes: 13, progressVolumes: 13, community: 86 }],
  ["Solo Leveling", "COMPLETED", 6.5, 200, 200, ["Action", "Adventure", "Fantasy"], 2018, { volumes: 14, progressVolumes: 14, country: "KR", community: 82 }],
  ["Planetes", "PLANNING", 0, 0, 26, ["Drama", "Sci-Fi", "Slice of Life"], 1999, { volumes: 4, community: 84 }],
  ["20th Century Boys", "PLANNING", 0, 0, 249, ["Drama", "Mystery", "Psychological", "Sci-Fi"], 1999, { volumes: 22, community: 87 }],
  ["Biomega", "PLANNING", 0, 0, 40, ["Action", "Horror", "Sci-Fi"], 2004, { volumes: 6, community: 76 }],
];

function toEntries(rows: Row[], type: MediaType, idBase: number, now: number): ListEntry[] {
  return rows.map(([title, status, score, progress, total, genres, year, extra = {}], i) => {
    const id = idBase + i;
    const path = type === "ANIME" ? "anime" : "manga";
    return {
      id,
      status,
      score,
      progress,
      progressVolumes: extra.progressVolumes ?? null,
      repeat: 0,
      updatedAt: now - i * 86_400 * 3,
      completedAt: status === "COMPLETED" ? `${Math.min(2026, year + 2)}-01-01` : null,
      media: {
        id,
        idMal: null,
        type,
        format: extra.format ?? (type === "ANIME" ? "TV" : "MANGA"),
        status: extra.mediaStatus ?? "FINISHED",
        episodes: type === "ANIME" ? total : null,
        chapters: type === "MANGA" ? total : null,
        volumes: extra.volumes ?? null,
        duration: type === "ANIME" ? (extra.duration ?? 24) : null,
        averageScore: extra.community ?? null,
        genres,
        country: extra.country ?? "JP",
        siteUrl: `https://anilist.co/search/${path}?search=${encodeURIComponent(title)}`,
        title,
        titleNative: null,
        cover: null,
        color: extra.color ?? null,
        year,
      },
    };
  });
}

export const DEMO_USERNAME = "demo";

export function demoLibrary(now = new Date()): Library {
  const seconds = Math.floor(now.getTime() / 1000);
  return {
    user: {
      id: 0,
      name: "NekoRunner",
      avatar: null,
      banner: null,
      siteUrl: "https://anilist.co",
    },
    anime: toEntries(ANIME, "ANIME", 900_000, seconds),
    manga: toEntries(MANGA, "MANGA", 950_000, seconds),
    syncedAt: now.toISOString(),
    demo: true,
  };
}

/** A partly-filled shelf so the shelf and wishlist pages have something to show. */
export function demoShelf(library: Library, now = new Date()): Shelf {
  const find = (title: string) => library.manga.find((e) => e.media.title === title);
  const plan: [string, (s: ReturnType<typeof seriesFromEntry>) => ReturnType<typeof seriesFromEntry>][] = [
    ["Akira", (s) => ({ ...ownFirst(s, 6), edition: "deluxe" })],
    ["BLAME!", (s) => ({ ...addVolumes(s, [1, 2, 3, 4, 6]), edition: "standard" })],
    ["Berserk", (s) => ({ ...ownFirst(s, 38), totalVolumes: 42, edition: "standard" })],
    ["Chainsaw Man", (s) => addVolumes(s, [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 14])],
    ["Pluto", (s) => ownFirst(s, 8)],
    ["Monster", (s) => ({ ...addVolumes(s, [1, 2, 3, 4, 5, 6]), totalVolumes: 9, edition: "omnibus" })],
  ];
  const shelf: Shelf = {};
  for (const [title, fill] of plan) {
    const entry = find(title);
    if (entry) shelf[entry.media.id] = fill(seriesFromEntry(entry, now));
  }
  return shelf;
}
