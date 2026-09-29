import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { cookies, headers } from "next/headers";
import { getPool, withTransaction } from "./db/pool";
import { loadState, touchProfile } from "./db/repo";
import { EMPTY_STATE, type KitsuneState } from "./state";
import { isUuid } from "./validate";

/**
 * There are no accounts: each browser gets an anonymous profile, identified by
 * a random id in an httpOnly cookie. The profile is created on the first write.
 */

const COOKIE = "kitsune_profile";
// Browsers cap cookie lifetimes at 400 days.
const MAX_AGE = 400 * 24 * 60 * 60;

export async function currentProfileId(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return isUuid(value) ? value.toLowerCase() : null;
}

/** The current profile's data, or the empty state for a browser that hasn't saved anything yet. */
export async function loadCurrentState(): Promise<KitsuneState> {
  const profileId = await currentProfileId();
  return profileId ? loadState(getPool(), profileId) : EMPTY_STATE;
}

/** Runs `fn` in a transaction for the current profile, creating the profile and its cookie if needed. */
export async function withProfile<T>(fn: (db: PoolClient, profileId: string) => Promise<T>): Promise<T> {
  const existing = await currentProfileId();
  const profileId = existing ?? randomUUID();
  const result = await withTransaction(async (db) => {
    await touchProfile(db, profileId);
    return fn(db, profileId);
  });
  if (!existing) {
    const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
    (await cookies()).set(COOKIE, profileId, {
      httpOnly: true,
      sameSite: "lax",
      secure: proto === "https",
      maxAge: MAX_AGE,
      path: "/",
    });
  }
  return result;
}

export async function forgetProfile() {
  (await cookies()).delete(COOKIE);
}
