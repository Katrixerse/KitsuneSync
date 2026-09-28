"use client";

import { useSyncExternalStore } from "react";
import type { Library } from "./anilist/types";
import { demoLibrary, demoShelf } from "./demo";
import type { Shelf, ShelfSeries } from "./shelf";
import type { WishlistState } from "./wishlist";

/**
 * All user data lives in the browser. AniList stays the source of truth for
 * lists; the shelf and wishlist are ours and are exported/imported as JSON.
 */

export interface KitsuneState {
  version: 1;
  library: Library | null;
  shelf: Shelf;
  wishlist: WishlistState;
}

const STORAGE_KEY = "kitsunesync:v1";

export const EMPTY_STATE: KitsuneState = {
  version: 1,
  library: null,
  shelf: {},
  wishlist: { manual: [], dismissed: [] },
};

let state: KitsuneState | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): KitsuneState {
  if (!raw) return EMPTY_STATE;
  try {
    const data = JSON.parse(raw) as Partial<KitsuneState>;
    if (data.version !== 1) return EMPTY_STATE;
    return {
      ...EMPTY_STATE,
      ...data,
      wishlist: { ...EMPTY_STATE.wishlist, ...data.wishlist },
    };
  } catch {
    return EMPTY_STATE;
  }
}

function read(): KitsuneState {
  if (state) return state;
  try {
    state = parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    state = EMPTY_STATE;
  }
  return state;
}

function emit() {
  listeners.forEach((l) => l());
}

export function setState(update: (prev: KitsuneState) => KitsuneState) {
  state = update(read());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: keep working in memory for this session.
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    state = parse(e.newValue);
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Returns the stored state, and `hydrated: false` during server render and hydration. */
export function useKitsune(): KitsuneState & { hydrated: boolean } {
  const snapshot = useSyncExternalStore(subscribe, read, () => null);
  return snapshot ? { ...snapshot, hydrated: true } : { ...EMPTY_STATE, hydrated: false };
}

/* ---------- actions ---------- */

export async function syncFromAniList(userName: string): Promise<Library> {
  const res = await fetch(`/api/anilist?user=${encodeURIComponent(userName.trim())}`);
  const body = await res.json().catch(() => ({ error: "Unexpected response from the server." }));
  if (!res.ok) throw new Error(body.error ?? `Sync failed (${res.status}).`);
  const library = body as Library;
  setState((prev) => {
    // Switching from the demo to a real account should not keep the demo shelf.
    const leavingDemo = prev.library?.demo && !library.demo;
    const shelf = leavingDemo ? {} : refreshShelf(prev.shelf, library);
    return { ...prev, library, shelf, wishlist: leavingDemo ? EMPTY_STATE.wishlist : prev.wishlist };
  });
  return library;
}

/** Updates shelf metadata (covers, titles, totals) from a fresh sync without touching owned volumes. */
function refreshShelf(shelf: Shelf, library: Library): Shelf {
  const byId = new Map(library.manga.map((e) => [e.media.id, e.media]));
  const next: Shelf = {};
  for (const series of Object.values(shelf)) {
    const media = byId.get(series.mediaId);
    next[series.mediaId] = media
      ? {
          ...series,
          title: media.title,
          cover: media.cover,
          color: media.color,
          siteUrl: media.siteUrl,
          totalVolumes: series.totalVolumes ?? media.volumes,
          ongoing: media.status === "RELEASING" || media.status === "HIATUS",
        }
      : series;
  }
  return next;
}

export function loadDemo() {
  const library = demoLibrary();
  setState(() => ({ ...EMPTY_STATE, library, shelf: demoShelf(library) }));
}

export function upsertSeries(series: ShelfSeries) {
  setState((prev) => ({ ...prev, shelf: { ...prev.shelf, [series.mediaId]: series } }));
}

export function removeSeries(mediaId: number) {
  setState((prev) => {
    const shelf = { ...prev.shelf };
    delete shelf[mediaId];
    return { ...prev, shelf };
  });
}

export function addManualWish(title: string, note: string) {
  setState((prev) => ({
    ...prev,
    wishlist: {
      ...prev.wishlist,
      manual: [
        ...prev.wishlist.manual,
        { id: crypto.randomUUID(), title, note, addedAt: new Date().toISOString() },
      ],
    },
  }));
}

export function dismissWish(key: string) {
  setState((prev) => {
    if (key.startsWith("manual:")) {
      const id = key.slice("manual:".length);
      return {
        ...prev,
        wishlist: { ...prev.wishlist, manual: prev.wishlist.manual.filter((m) => m.id !== id) },
      };
    }
    return {
      ...prev,
      wishlist: { ...prev.wishlist, dismissed: [...new Set([...prev.wishlist.dismissed, key])] },
    };
  });
}

export function restoreDismissed() {
  setState((prev) => ({ ...prev, wishlist: { ...prev.wishlist, dismissed: [] } }));
}

export function resetAll() {
  setState(() => EMPTY_STATE);
}

export function exportBackup(): string {
  const { shelf, wishlist, library } = read();
  return JSON.stringify(
    { app: "kitsunesync", version: 1, exportedAt: new Date().toISOString(), user: library?.user.name ?? null, shelf, wishlist },
    null,
    2,
  );
}

/** Restores the shelf and wishlist from a backup. The AniList library is re-synced, not restored. */
export function importBackup(json: string) {
  const data = JSON.parse(json);
  if (data?.app !== "kitsunesync" || typeof data.shelf !== "object") {
    throw new Error("That file isn't a KitsuneSync backup.");
  }
  setState((prev) => ({
    ...prev,
    shelf: data.shelf as Shelf,
    wishlist: { ...EMPTY_STATE.wishlist, ...data.wishlist },
  }));
}
