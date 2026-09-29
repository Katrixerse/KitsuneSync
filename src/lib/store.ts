"use client";

import { createContext, createElement, use, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  addManualWishAction,
  dismissWishAction,
  importBackupAction,
  loadDemoAction,
  loadStateAction,
  removeSeriesAction,
  resetAllAction,
  restoreDismissedAction,
  syncLibraryAction,
  upsertSeriesAction,
} from "@/app/actions";
import type { Library } from "./anilist/types";
import type { ShelfSeries } from "./shelf";
import { applySync, EMPTY_STATE, type KitsuneState } from "./state";
import { parseBackup } from "./validate";

export type { KitsuneState } from "./state";

/**
 * Client-side copy of the profile's data. The root layout loads it from
 * Postgres and seeds this store; after that, actions update it right away and
 * save to the server in the background (Server Actions run one at a time, in
 * order). If a save fails, the store reloads what the server has.
 */

let state: KitsuneState | null = null;
let saveError: string | null = null;
const listeners = new Set<() => void>();

const InitialState = createContext<KitsuneState>(EMPTY_STATE);

export function KitsuneProvider({ initial, children }: { initial: KitsuneState; children: ReactNode }) {
  // Seed once. Later server renders (e.g. after the profile cookie is set) may
  // predate optimistic changes still being saved, so they don't overwrite them.
  useLayoutEffect(() => {
    state ??= initial;
  }, [initial]);
  return createElement(InitialState, { value: initial }, children);
}

function current(): KitsuneState {
  return state ?? EMPTY_STATE;
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(update: (prev: KitsuneState) => KitsuneState) {
  state = update(current());
  emit();
}

/** Applies a change locally, then saves it. */
function mutate(update: (prev: KitsuneState) => KitsuneState, save: () => Promise<unknown>) {
  setState(update);
  save().then(
    () => {
      if (saveError) {
        saveError = null;
        emit();
      }
    },
    async (err) => {
      console.error("Save failed", err);
      saveError = "Couldn't save your last change. Showing what's saved.";
      try {
        state = await loadStateAction();
      } catch {
        saveError = "Can't reach the server. Changes aren't being saved.";
      }
      emit();
    },
  );
}

export function useKitsune(): KitsuneState {
  const initial = use(InitialState);
  return useSyncExternalStore(subscribe, () => state ?? initial, () => initial);
}

/** The last save error, cleared by the next successful save. */
export function useSaveError(): string | null {
  return useSyncExternalStore(subscribe, () => saveError, () => null);
}

/* ---------- actions ---------- */

export async function syncFromAniList(userName: string): Promise<Library> {
  const result = await syncLibraryAction(userName);
  if (!result.ok) throw new Error(result.error);
  setState((prev) => applySync(prev, result.library));
  return result.library;
}

export async function loadDemo() {
  const next = await loadDemoAction();
  setState(() => next);
}

export function upsertSeries(series: ShelfSeries) {
  mutate(
    (prev) => ({ ...prev, shelf: { ...prev.shelf, [series.mediaId]: series } }),
    () => upsertSeriesAction(series),
  );
}

export function removeSeries(mediaId: number) {
  mutate(
    (prev) => {
      const shelf = { ...prev.shelf };
      delete shelf[mediaId];
      return { ...prev, shelf };
    },
    () => removeSeriesAction(mediaId),
  );
}

export function addManualWish(title: string, note: string) {
  const wish = { id: crypto.randomUUID(), title, note, addedAt: new Date().toISOString() };
  mutate(
    (prev) => ({ ...prev, wishlist: { ...prev.wishlist, manual: [...prev.wishlist.manual, wish] } }),
    () => addManualWishAction(wish),
  );
}

export function dismissWish(key: string) {
  mutate(
    (prev) => {
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
    },
    () => dismissWishAction(key),
  );
}

export function restoreDismissed() {
  mutate((prev) => ({ ...prev, wishlist: { ...prev.wishlist, dismissed: [] } }), restoreDismissedAction);
}

export function resetAll() {
  mutate(() => EMPTY_STATE, resetAllAction);
}

export function exportBackup(): string {
  const { shelf, wishlist, library } = current();
  return JSON.stringify(
    { app: "kitsunesync", version: 1, exportedAt: new Date().toISOString(), user: library?.user.name ?? null, shelf, wishlist },
    null,
    2,
  );
}

/** Restores the shelf and wishlist from a backup. The AniList library is re-synced, not restored. */
export function importBackup(json: string) {
  const backup = parseBackup(json);
  mutate((prev) => ({ ...prev, ...backup }), () => importBackupAction(backup));
}
