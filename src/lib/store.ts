"use client";

import { createContext, createElement, use, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  addManualWishAction,
  createLinkCodeAction,
  dismissWishAction,
  importBackupAction,
  loadDemoAction,
  loadStateAction,
  redeemLinkCodeAction,
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
 * order). If a save fails, the store reloads what the server has, but only
 * once every pending save has settled, so edits made in the meantime aren't
 * overwritten. A reload that an edit overtook is discarded and run again.
 */

let state: KitsuneState | null = null;
let saveError: string | null = null;
const listeners = new Set<() => void>();

/** Saves still in flight. */
let pending = 0;
/** Bumped by every local change; a reload that began before one is stale. */
let generation = 0;
let reloadNeeded = false;
let reloading = false;

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
  generation++;
  emit();
}

/** Applies a change locally, then saves it. */
function mutate(update: (prev: KitsuneState) => KitsuneState, save: () => Promise<unknown>) {
  setState(update);
  pending++;
  save()
    .then(
      () => {
        if (saveError) {
          saveError = null;
          emit();
        }
      },
      (err) => {
        console.error("Save failed", err);
        saveError = "Couldn't save your last change. Showing what's saved.";
        reloadNeeded = true;
        emit();
      },
    )
    .finally(() => {
      pending--;
      void reload();
    });
}

/**
 * Replaces the local state with the server's after a failed save, once no
 * save is pending. A change made while the reload is in flight makes its
 * result stale, so it's dropped and the reload runs again after that save.
 */
async function reload() {
  if (!reloadNeeded || pending > 0 || reloading) return;
  reloadNeeded = false;
  reloading = true;
  const started = generation;
  try {
    const saved = await loadStateAction();
    if (generation === started) {
      state = saved;
      emit();
    } else {
      reloadNeeded = true;
    }
  } catch {
    saveError = "Can't reach the server. Changes aren't being saved.";
    emit();
  } finally {
    reloading = false;
  }
  // A save that settled during the reload couldn't start one; try again now.
  void reload();
}

export function useKitsune(): KitsuneState {
  const initial = use(InitialState);
  return useSyncExternalStore(subscribe, () => state ?? initial, () => initial);
}

/** The last save error, cleared by the next successful save. */
export function useSaveError(): string | null {
  return useSyncExternalStore(subscribe, () => saveError, () => null);
}

/** What the hooks would return right now. For tests; components use the hooks. */
export function readStore(): { state: KitsuneState; saveError: string | null } {
  return { state: current(), saveError };
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

/** A one-time code that opens this profile on another device. Nothing changes locally. */
export function createLinkCode() {
  return createLinkCodeAction();
}

/**
 * Switches this browser to the profile behind `code`. On success the store shows
 * that profile from now on; on failure nothing changes and the result says why.
 */
export async function linkProfile(code: string) {
  const result = await redeemLinkCodeAction(code);
  if (result.ok) setState(() => result.state);
  return result;
}
