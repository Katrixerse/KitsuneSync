export type MediaType = "ANIME" | "MANGA";

export type ListStatus =
  | "CURRENT"
  | "PLANNING"
  | "COMPLETED"
  | "DROPPED"
  | "PAUSED"
  | "REPEATING";

export type MediaStatus =
  | "FINISHED"
  | "RELEASING"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS";

export interface Media {
  id: number;
  idMal: number | null;
  type: MediaType;
  format: string | null;
  status: MediaStatus | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  /** Minutes per episode. */
  duration: number | null;
  /** Community score, 0-100. */
  averageScore: number | null;
  genres: string[];
  /** ISO 3166-1 alpha-2 code: JP, KR, CN, TW. */
  country: string | null;
  siteUrl: string;
  title: string;
  titleNative: string | null;
  cover: string | null;
  color: string | null;
  year: number | null;
}

export interface ListEntry {
  id: number;
  status: ListStatus;
  /** User score on a 0-10 scale, 0 when unscored. */
  score: number;
  progress: number;
  progressVolumes: number | null;
  repeat: number;
  /** Unix seconds. */
  updatedAt: number;
  completedAt: string | null;
  media: Media;
}

export interface AniListUser {
  id: number;
  name: string;
  avatar: string | null;
  banner: string | null;
  siteUrl: string;
}

export interface Library {
  user: AniListUser;
  anime: ListEntry[];
  manga: ListEntry[];
  /** ISO timestamp of the sync. */
  syncedAt: string;
  demo?: boolean;
}

export const STATUS_LABELS: Record<ListStatus, { anime: string; manga: string }> = {
  CURRENT: { anime: "Watching", manga: "Reading" },
  REPEATING: { anime: "Rewatching", manga: "Rereading" },
  COMPLETED: { anime: "Completed", manga: "Completed" },
  PAUSED: { anime: "Paused", manga: "Paused" },
  DROPPED: { anime: "Dropped", manga: "Dropped" },
  PLANNING: { anime: "Planning", manga: "Planning" },
};
