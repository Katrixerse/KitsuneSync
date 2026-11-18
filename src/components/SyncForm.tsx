"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Library } from "@/lib/anilist/types";
import type { Shelf } from "@/lib/shelf";
import { loadDemo, syncFromAniList, useKitsune } from "@/lib/store";

interface SyncFormProps {
  defaultUser?: string;
  /** Where to go after a successful sync. Omit to stay on the page. */
  redirectTo?: string;
  showDemo?: boolean;
}

/**
 * The question to confirm before syncing another account over a shelf built
 * from the current one, or null when the switch needs no confirmation.
 */
export function accountSwitchWarning(library: Library | null, shelf: Shelf, userName: string): string | null {
  const count = Object.keys(shelf).length;
  if (!library || library.demo || !count) return null;
  const from = library.user.name;
  if (from.toLowerCase() === userName.toLowerCase()) return null;
  return `Your shelf has ${count} series synced from @${from}. Switch to @${userName} and keep the shelf? (You can clear everything in Settings.)`;
}

export function SyncForm({ defaultUser = "", redirectTo, showDemo = true }: SyncFormProps) {
  const router = useRouter();
  const { library, shelf } = useKitsune();
  const [user, setUser] = useState(defaultUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user.trim()) return;
    const warning = accountSwitchWarning(library, shelf, user.trim());
    if (warning && !confirm(warning)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const library = await syncFromAniList(user);
      setDone(`Synced ${library.anime.length} anime and ${library.manga.length} manga.`);
      if (redirectTo) router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDemo() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await loadDemo();
      if (redirectTo) router.push(redirectTo);
      else setDone("Demo data loaded.");
    } catch (err) {
      console.error(err);
      setError("Couldn't load the demo. Is the database up?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <label htmlFor="anilist-user" className="label mb-2 block">
        AniList username
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="anilist-user"
          className="input"
          placeholder="e.g. Josh"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={busy || !user.trim()}>
          {busy ? "Syncing…" : "Sync"}
        </button>
        {showDemo && (
          <button type="button" className="btn btn-ghost shrink-0" onClick={onDemo} disabled={busy}>
            Try demo
          </button>
        )}
      </div>
      <p className="mt-2 min-h-5 font-mono text-xs" aria-live="polite">
        {error && <span className="text-neon-pink">✖ {error}</span>}
        {done && <span className="text-neon-green">✔ {done}</span>}
        {!error && !done && <span className="text-mute">Public lists only. No login, no token.</span>}
      </p>
    </form>
  );
}
