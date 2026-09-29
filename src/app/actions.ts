"use server";

import { AniListError, fetchLibrary } from "@/lib/anilist/client";
import type { Library } from "@/lib/anilist/types";
import * as repo from "@/lib/db/repo";
import { getPool } from "@/lib/db/pool";
import { DEMO_USERNAME, demoLibrary, demoShelf } from "@/lib/demo";
import { currentProfileId, forgetProfile, loadCurrentState, withProfile } from "@/lib/session";
import { applySync, EMPTY_STATE, type KitsuneState } from "@/lib/state";
import { parseDismissKey, parseManualWish, parseShelf, parseShelfSeries, parseWishlist } from "@/lib/validate";

/**
 * Every write for the current browser profile. The client store applies each
 * change optimistically and calls one of these to persist it. Inputs come
 * straight from the network, so each one is validated here.
 */

export type SyncResult = { ok: true; library: Library } | { ok: false; error: string };

/** Fetches a public AniList library and saves it, refreshing shelf metadata. */
export async function syncLibraryAction(userName: unknown): Promise<SyncResult> {
  const user = typeof userName === "string" ? userName.trim() : "";
  if (!user) return { ok: false, error: "Enter an AniList username." };
  if (user.length > 100) return { ok: false, error: "That username is too long." };

  let library: Library;
  try {
    library = user.toLowerCase() === DEMO_USERNAME ? demoLibrary() : await fetchLibrary(user);
  } catch (err) {
    if (err instanceof AniListError) return { ok: false, error: err.message };
    console.error("AniList sync failed", err);
    return { ok: false, error: "Couldn't reach AniList. Try again shortly." };
  }

  await withProfile(async (db, profileId) => {
    const prev = await repo.loadState(db, profileId);
    const next = applySync(prev, library);
    await repo.saveLibrary(db, profileId, next.library);
    await repo.replaceShelf(db, profileId, next.shelf);
    if (next.wishlist !== prev.wishlist) await repo.replaceWishlist(db, profileId, next.wishlist);
  });
  return { ok: true, library };
}

export async function loadDemoAction(): Promise<KitsuneState> {
  const library = demoLibrary();
  const state: KitsuneState = { ...EMPTY_STATE, library, shelf: demoShelf(library) };
  await withProfile(async (db, profileId) => {
    await repo.saveLibrary(db, profileId, state.library);
    await repo.replaceShelf(db, profileId, state.shelf);
    await repo.replaceWishlist(db, profileId, state.wishlist);
  });
  return state;
}

/** The saved state, used by the client to recover after a failed save. */
export async function loadStateAction(): Promise<KitsuneState> {
  return loadCurrentState();
}

export async function upsertSeriesAction(series: unknown) {
  const clean = parseShelfSeries(series);
  await withProfile((db, profileId) => repo.upsertSeries(db, profileId, clean));
}

export async function removeSeriesAction(mediaId: unknown) {
  if (!Number.isSafeInteger(mediaId)) throw new Error("Invalid media id.");
  await withProfile((db, profileId) => repo.deleteSeries(db, profileId, mediaId as number));
}

export async function addManualWishAction(wish: unknown) {
  const clean = parseManualWish(wish);
  await withProfile((db, profileId) => repo.addManualWish(db, profileId, clean));
}

/** Hides an auto-generated item, or deletes a manual one (`manual:<id>`). */
export async function dismissWishAction(key: unknown) {
  const clean = parseDismissKey(key);
  await withProfile((db, profileId) =>
    clean.startsWith("manual:")
      ? repo.deleteManualWish(db, profileId, clean.slice("manual:".length))
      : repo.dismissKey(db, profileId, clean),
  );
}

export async function restoreDismissedAction() {
  await withProfile((db, profileId) => repo.clearDismissed(db, profileId));
}

export async function importBackupAction(backup: { shelf: unknown; wishlist: unknown }) {
  const shelf = parseShelf(backup?.shelf);
  const wishlist = parseWishlist(backup?.wishlist);
  await withProfile(async (db, profileId) => {
    await repo.replaceShelf(db, profileId, shelf);
    await repo.replaceWishlist(db, profileId, wishlist);
  });
}

/** Deletes the profile and everything in it, and forgets this browser's cookie. */
export async function resetAllAction() {
  const profileId = await currentProfileId();
  if (profileId) await repo.deleteProfile(getPool(), profileId);
  await forgetProfile();
}
