import type { Library, ListEntry } from "./anilist/types";
import type { ShelfStats } from "./shelf";

export interface GenreShare {
  genre: string;
  count: number;
  share: number;
}

export interface ProfileStats {
  animeCount: number;
  mangaCount: number;
  episodes: number;
  minutesWatched: number;
  chapters: number;
  volumesRead: number;
  meanScore: number | null;
  scoredCount: number;
  /** Mean of (user score - community score) in points on a 0-10 scale. Positive means kinder than the crowd. */
  scoreDelta: number | null;
  /** Mean absolute disagreement with the community, 0-10 scale. */
  contrarian: number | null;
  topGenres: GenreShare[];
  dropped: number;
  droppedRate: number;
  planning: number;
  medianYear: number | null;
  movieCount: number;
  /** Share of manga entries from Korea or China/Taiwan. */
  webtoonShare: number;
}

/** Entries the user has actually started, which is what taste is judged on. */
function started(entries: ListEntry[]) {
  return entries.filter((e) => e.status !== "PLANNING");
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeStats(library: Pick<Library, "anime" | "manga">): ProfileStats {
  const anime = started(library.anime);
  const manga = started(library.manga);
  const all = [...anime, ...manga];

  let episodes = 0;
  let minutesWatched = 0;
  for (const e of anime) {
    const eps = e.progress + e.repeat * (e.media.episodes ?? 0);
    episodes += eps;
    minutesWatched += eps * (e.media.duration ?? 24);
  }

  let chapters = 0;
  let volumesRead = 0;
  for (const e of manga) {
    chapters += e.progress + e.repeat * (e.media.chapters ?? 0);
    volumesRead += e.progressVolumes ?? 0;
  }

  const scored = all.filter((e) => e.score > 0);
  const meanScore = scored.length
    ? round1(scored.reduce((n, e) => n + e.score, 0) / scored.length)
    : null;

  const compared = scored.filter((e) => e.media.averageScore);
  const deltas = compared.map((e) => e.score - (e.media.averageScore ?? 0) / 10);
  const scoreDelta = deltas.length ? round1(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;
  const contrarian = deltas.length
    ? round1(deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length)
    : null;

  const genreCounts = new Map<string, number>();
  for (const e of all) {
    for (const g of e.media.genres) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
  }
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([genre, count]) => ({ genre, count, share: all.length ? count / all.length : 0 }));

  const dropped = all.filter((e) => e.status === "DROPPED").length;
  const webtoons = manga.filter((e) => e.media.country && e.media.country !== "JP").length;

  return {
    animeCount: anime.length,
    mangaCount: manga.length,
    episodes,
    minutesWatched,
    chapters,
    volumesRead,
    meanScore,
    scoredCount: scored.length,
    scoreDelta,
    contrarian,
    topGenres,
    dropped,
    droppedRate: all.length ? dropped / all.length : 0,
    planning: library.anime.length + library.manga.length - all.length,
    medianYear: median(all.map((e) => e.media.year).filter((y): y is number => !!y)),
    movieCount: anime.filter((e) => e.media.format === "MOVIE").length,
    webtoonShare: manga.length ? webtoons / manga.length : 0,
  };
}

export function daysWatched(stats: ProfileStats): number {
  return round1(stats.minutesWatched / 60 / 24);
}

/* ---------- ID card identity ---------- */

export interface Role {
  name: string;
  tagline: string;
}

const ROLES: [genres: string[], role: Role][] = [
  [["Sci-Fi", "Mecha"], { name: "Netrunner", tagline: "Jacked into the future, one arc at a time." }],
  [["Psychological", "Thriller", "Mystery"], { name: "Fixer", tagline: "Trusts no narrator." }],
  [["Horror", "Supernatural"], { name: "Ghost", tagline: "Watches with the lights off." }],
  [["Action", "Sports"], { name: "Street Samurai", tagline: "Here for the fight scenes. Stays for the fight scenes." }],
  [["Romance", "Drama"], { name: "Rockerboy", tagline: "Heart on sleeve, tissues on standby." }],
  [["Slice of Life", "Comedy"], { name: "Nomad", tagline: "Drifts wherever the vibes are cozy." }],
  [["Fantasy", "Adventure"], { name: "Techno-Shaman", tagline: "Isekai'd more times than they can count." }],
  [["Music", "Mahou Shoujo"], { name: "Idol Hacker", tagline: "Transforms on command." }],
];

const DEFAULT_ROLE: Role = { name: "Drifter", tagline: "Data pending. Sync to calibrate." };

export function assignRole(stats: ProfileStats): Role {
  const top = stats.topGenres[0]?.genre;
  if (!top) return DEFAULT_ROLE;
  return ROLES.find(([genres]) => genres.includes(top))?.[1] ?? {
    name: `${top} Operative`,
    tagline: "Specialist of a rare discipline.",
  };
}

const RANKS = ["Rookie", "Street Kid", "Merc", "Veteran", "Elite", "Legend", "Myth"];

export function computeLevel(stats: ProfileStats): { level: number; rank: string; progress: number } {
  const xp = stats.episodes + stats.chapters / 3;
  const raw = Math.sqrt(xp / 8);
  const level = Math.min(99, Math.floor(raw) + 1);
  const rank = RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 12))];
  return { level, rank, progress: level === 99 ? 1 : raw - Math.floor(raw) };
}

/** Small deterministic hash, used so the same user always gets the same card serial and quips. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function cardSerial(userId: number, name: string): string {
  const hex = hashString(`${userId}:${name}`).toString(16).toUpperCase().padStart(8, "0");
  return `KS-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/* ---------- Cat commentary ---------- */

export type CatMood = "smug" | "excited" | "judging" | "sleepy" | "love";

export interface CatLine {
  id: string;
  mood: CatMood;
  text: string;
}

interface Rule {
  id: string;
  mood: CatMood;
  weight: number;
  when: (s: ProfileStats, shelf: ShelfStats) => boolean;
  lines: ((s: ProfileStats, shelf: ShelfStats) => string)[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const topGenre = (s: ProfileStats) => s.topGenres[0]?.genre ?? "";

const GENRE_QUIPS: Record<string, string[]> = {
  "Sci-Fi": ["Sci-fi main. Welcome to the net, choom.", "So many robots. None of them feed me."],
  Mecha: ["Giant robots again? Get in the robot, I guess."],
  Romance: ["Top genre: Romance. Aww. I won't tell anyone. Probably."],
  Drama: ["Drama is your top genre. You like crying on purpose, huh."],
  "Slice of Life": ["Slice of Life fan. Cozy. Like a sunbeam on a keyboard."],
  Comedy: ["Comedy main. At least one of us has a sense of humor."],
  Action: ["Action first, plot later. I respect a cat-like attention span."],
  Psychological: ["Psychological thrillers. Should I be worried about you?"],
  Horror: ["Horror fan. I'll be under the bed. Not scared. Just resting."],
  Fantasy: ["Fantasy everywhere. How many times have you been reincarnated as a slime?"],
  Sports: ["Sports anime. Imagine putting that much energy into anything. Couldn't be me."],
  Mystery: ["Mystery main. The culprit is always the one with the fewest lines."],
  Supernatural: ["Lots of supernatural. For the record, I am not a yokai. Mostly."],
  Adventure: ["Adventure main. You'd love my hallway sprints at 3am."],
};

const RULES: Rule[] = [
  {
    id: "empty",
    mood: "sleepy",
    weight: 100,
    when: (s) => s.animeCount + s.mangaCount === 0,
    lines: [() => "Nothing to judge yet. Sync a list and I'll get to work."],
  },
  {
    id: "genre",
    mood: "smug",
    weight: 50,
    when: (s) => !!GENRE_QUIPS[topGenre(s)],
    lines: [(s) => GENRE_QUIPS[topGenre(s)][0], (s) => GENRE_QUIPS[topGenre(s)].at(-1)!],
  },
  {
    id: "generous",
    mood: "judging",
    weight: 60,
    when: (s) => (s.meanScore ?? 0) >= 8.3 && s.scoredCount >= 5,
    lines: [
      (s) => `Average score ${s.meanScore}. You like everything. Suspicious.`,
      (s) => `A ${s.meanScore} mean score? Hand out a 5 sometime, it builds character.`,
    ],
  },
  {
    id: "harsh",
    mood: "judging",
    weight: 60,
    when: (s) => s.meanScore !== null && s.meanScore <= 6.2 && s.scoredCount >= 5,
    lines: [(s) => `A ${s.meanScore} average. Tough crowd. I like you.`],
  },
  {
    id: "contrarian",
    mood: "smug",
    weight: 55,
    when: (s) => (s.contrarian ?? 0) >= 1.4 && s.scoredCount >= 8,
    lines: [
      (s) => `You disagree with AniList by ${s.contrarian} points on average. Hipster detected.`,
    ],
  },
  {
    id: "dropper",
    mood: "judging",
    weight: 45,
    when: (s) => s.dropped >= 5 && s.droppedRate >= 0.15,
    lines: [(s) => `${s.dropped} dropped (${pct(s.droppedRate)}). Commitment issues? Relatable.`],
  },
  {
    id: "finisher",
    mood: "love",
    weight: 20,
    when: (s) => s.animeCount + s.mangaCount >= 20 && s.dropped === 0,
    lines: [() => "Zero drops. You finish what you start. Unlike me with that cardboard box."],
  },
  {
    id: "backlog",
    mood: "sleepy",
    weight: 40,
    when: (s) => s.planning >= 50,
    lines: [(s) => `${s.planning} titles on plan-to-watch. You'll never finish. I'll keep your seat warm.`],
  },
  {
    id: "days",
    mood: "excited",
    weight: 35,
    when: (s) => daysWatched(s) >= 30,
    lines: [
      (s) => `${daysWatched(s)} days of anime. That's ${Math.round(daysWatched(s) * 16)} hours I could have napped on you.`,
    ],
  },
  {
    id: "retro",
    mood: "love",
    weight: 35,
    when: (s) => (s.medianYear ?? 9999) <= 2005,
    lines: [(s) => `Median year ${s.medianYear}. You watch stuff older than me. Respect the classics.`],
  },
  {
    id: "seasonal",
    mood: "excited",
    weight: 25,
    when: (s) => (s.medianYear ?? 0) >= new Date().getFullYear() - 3,
    lines: [() => "Seasonal chaser. Don't worry, next season's isekai will be different. It won't."],
  },
  {
    id: "webtoon",
    mood: "smug",
    weight: 30,
    when: (s) => s.webtoonShare >= 0.3 && s.mangaCount >= 5,
    lines: [(s) => `${pct(s.webtoonShare)} of your reading is manhwa or manhua. Vertical scrolling counts as cardio.`],
  },
  {
    id: "anime-only",
    mood: "judging",
    weight: 30,
    when: (s) => s.animeCount >= 20 && s.mangaCount < 3,
    lines: [() => "Anime-only? The manga did it better. It always does."],
  },
  {
    id: "movies",
    mood: "excited",
    weight: 15,
    when: (s) => s.movieCount >= 10,
    lines: [(s) => `${s.movieCount} movies. You're the reason I never get the couch.`],
  },
  {
    id: "no-shelf",
    mood: "sleepy",
    weight: 25,
    when: (s, shelf) => shelf.volumes === 0 && s.mangaCount > 0,
    lines: [() => "No physical manga? Paper smells nice. Boxes they ship in are nicer."],
  },
  {
    id: "big-shelf",
    mood: "love",
    weight: 45,
    when: (_, shelf) => shelf.volumes >= 50,
    lines: [(_, shelf) => `${shelf.volumes} physical volumes. Your shelf is load-bearing. I will sit on it.`],
  },
  {
    id: "gaps",
    mood: "judging",
    weight: 40,
    when: (_, shelf) => shelf.gaps >= 3,
    lines: [(_, shelf) => `${shelf.gaps} gaps on your shelf. It's like a smile with missing teeth.`],
  },
  {
    id: "complete-set",
    mood: "excited",
    weight: 30,
    when: (_, shelf) => shelf.complete >= 1,
    lines: [
      (_, shelf) =>
        `${shelf.complete} complete ${shelf.complete === 1 ? "set" : "sets"}. Not a single gap. Chef's kiss.`,
    ],
  },
];

/** Picks the most relevant quips for this profile, deterministic per user. */
export function catCommentary(
  stats: ProfileStats,
  shelf: ShelfStats,
  seed: string,
  limit = 4,
): CatLine[] {
  return RULES.filter((r) => r.when(stats, shelf))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((r) => {
      const line = r.lines[hashString(`${seed}:${r.id}`) % r.lines.length];
      return { id: r.id, mood: r.mood, text: line(stats, shelf) };
    });
}
