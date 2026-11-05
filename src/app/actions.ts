"use server";

import { headers } from "next/headers";
import { AniListError, fetchLibrary } from "@/lib/anilist/client";
import type { Library } from "@/lib/anilist/types";
import * as repo from "@/lib/db/repo";
import { getPool, withTransaction } from "@/lib/db/pool";
import { DEMO_USERNAME, demoLibrary, demoShelf } from "@/lib/demo";
import { formatLinkCode, generateLinkCode, LINK_CODE_TTL_MS } from "@/lib/link-code";
import { linkLimiter, syncLimiter } from "@/lib/rate-limit";
import { currentProfileId, forgetProfile, loadCurrentState, setProfileCookie, withProfile } from "@/lib/session";
import { applySync, EMPTY_STATE, type KitsuneState } from "@/lib/state";
import { libraryCache } from "@/lib/sync-cache";
import {
  assertDismissedCount,
  assertManualWishCount,
  assertShelfSize,
  parseDismissKey,
  parseLinkCode,
  parseManualWish,
  parseShelf,
  parseShelfSeries,
  parseWishlist,
  ValidationError,
} from "@/lib/validate";

/**
 * Every write for the current browser profile. The client store applies each
 * change optimistically and calls one of these to persist it. Inputs come
 * straight from the network, so each one is validated here.
 */

export type SyncResult = { ok: true; library: Library } | { ok: false; error: string };
export type LinkCodeResult = { ok: true; code: string; expiresAt: string } | { ok: false; error: string };
export type LinkResult = { ok: true; state: KitsuneState } | { ok: false; error: string };

/** Who is asking, for rate limits: the profile when the browser has one, else the client IP so limits apply before the first save too. */
async function limitKey(): Promise<string> {
  const profileId = await currentProfileId();
  if (profileId) return `profile:${profileId}`;
  // Behind a reverse proxy the first x-forwarded-for entry is the client.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${ip || "unknown"}`;
}

/** A library from the one-minute cache when there is one, else freshly fetched. The demo never touches AniList. */
async function loadLibrary(user: string): Promise<Library> {
  const key = user.toLowerCase();
  if (key === DEMO_USERNAME) return demoLibrary();
  const cached = libraryCache.get(key);
  if (cached) return cached;
  const library = await fetchLibrary(user);
  libraryCache.set(key, library);
  return library;
}

/** Fetches a public AniList library and saves it, refreshing shelf metadata. */
export async function syncLibraryAction(userName: unknown): Promise<SyncResult> {
  const user = typeof userName === "string" ? userName.trim() : "";
  if (!user) return { ok: false, error: "Enter an AniList username." };
  if (user.length > 100) return { ok: false, error: "That username is too long." };
  if (!syncLimiter.allow(await limitKey())) return { ok: false, error: "Too many syncs. Try again in a minute." };

  let library: Library;
  try {
    library = await loadLibrary(user);
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

// The size checks below run inside withProfile, which locks the profile row,
// so two writes for one profile can't both squeeze past a cap.

export async function upsertSeriesAction(series: unknown) {
  const clean = parseShelfSeries(series);
  await withProfile(async (db, profileId) => {
    assertShelfSize((await repo.countSeries(db, profileId, clean.mediaId)) + 1);
    await repo.upsertSeries(db, profileId, clean);
  });
}

export async function removeSeriesAction(mediaId: unknown) {
  if (!Number.isSafeInteger(mediaId)) throw new Error("Invalid media id.");
  await withProfile((db, profileId) => repo.deleteSeries(db, profileId, mediaId as number));
}

export async function addManualWishAction(wish: unknown) {
  const clean = parseManualWish(wish);
  await withProfile(async (db, profileId) => {
    assertManualWishCount((await repo.countManualWishes(db, profileId, clean.id)) + 1);
    await repo.addManualWish(db, profileId, clean);
  });
}

/** Hides an auto-generated item, or deletes a manual one (`manual:<id>`). */
export async function dismissWishAction(key: unknown) {
  const clean = parseDismissKey(key);
  await withProfile(async (db, profileId) => {
    if (clean.startsWith("manual:")) {
      await repo.deleteManualWish(db, profileId, clean.slice("manual:".length));
      return;
    }
    assertDismissedCount((await repo.countDismissed(db, profileId, clean)) + 1);
    await repo.dismissKey(db, profileId, clean);
  });
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

/** A one-time code that opens this browser's profile on another device. Replaces the profile's earlier code. */
export async function createLinkCodeAction(): Promise<LinkCodeResult> {
  // A browser without a profile has nothing to link; making one here would only create an empty profile.
  if (!(await currentProfileId())) return { ok: false, error: "Nothing to link yet. Sync or add something first." };
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await withProfile((db, profileId) => repo.createLinkCode(db, profileId, code, expiresAt));
  return { ok: true, code: formatLinkCode(code), expiresAt: expiresAt.toISOString() };
}

/**
 * Points this browser at the profile behind a link code, and returns that profile's
 * data. The profile the browser had before stays on the server untouched (cleanup
 * removes it in time if it is empty). Errors are returned, not thrown: Next hides
 * the message of a thrown error from the client in production.
 */
export async function redeemLinkCodeAction(input: unknown): Promise<LinkResult> {
  let code: string;
  try {
    code = parseLinkCode(input);
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
  if (!linkLimiter.allow(await limitKey())) return { ok: false, error: "Too many attempts. Try again in a minute." };

  const current = await currentProfileId();
  const linked = await withTransaction(async (db) => {
    const profileId = await repo.consumeLinkCode(db, code);
    if (!profileId) return null;
    // Redeeming your own code switches nothing, but the code is still used up.
    if (profileId !== current) await repo.touchProfile(db, profileId);
    return { profileId, state: await repo.loadState(db, profileId) };
  });
  if (!linked) return { ok: false, error: "That code is invalid or has expired." };
  if (linked.profileId !== current) await setProfileCookie(linked.profileId);
  return { ok: true, state: linked.state };
}
