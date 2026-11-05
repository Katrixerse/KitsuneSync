"use client";

import { useRef, useState } from "react";
import { SyncForm } from "@/components/SyncForm";
import { createLinkCode, exportBackup, importBackup, linkProfile, resetAll, useKitsune } from "@/lib/store";

type Message = { ok: boolean; text: string };

export function Settings() {
  const { library, shelf } = useKitsune();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<Message | null>(null);

  function download() {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kitsunesync-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      importBackup(await file.text());
      setMessage({ ok: true, text: "Shelf and wishlist restored." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Import failed." });
    }
  }

  async function showLinkCode() {
    setLinking(true);
    setLinkMessage(null);
    try {
      const result = await createLinkCode();
      if (result.ok) setLinkCode(result.code);
      else setLinkMessage({ ok: false, text: result.error });
    } catch (err) {
      console.error(err);
      setLinkMessage({ ok: false, text: "Couldn't make a link code. Try again shortly." });
    } finally {
      setLinking(false);
    }
  }

  async function onLink(e: React.FormEvent) {
    e.preventDefault();
    if (!codeInput.trim()) return;
    // Linking replaces what this browser shows; the old profile stays on the server but is no longer reachable from here.
    const hasData = library !== null || Object.keys(shelf).length > 0;
    if (hasData && !confirm("This browser will switch to the linked profile. Export a backup first if you want to keep what's here.")) {
      return;
    }
    setLinking(true);
    setLinkMessage(null);
    try {
      const result = await linkProfile(codeInput);
      if (result.ok) {
        setCodeInput("");
        setLinkCode(null); // belonged to the profile this browser just left
        const name = result.state.library ? `@${result.state.library.user.name}` : "the linked profile";
        setLinkMessage({ ok: true, text: `Linked. Showing ${name}.` });
      } else {
        setLinkMessage({ ok: false, text: result.error });
      }
    } catch (err) {
      console.error(err);
      setLinkMessage({ ok: false, text: "Couldn't link. Try again shortly." });
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">Settings</h1>

      <section className="panel p-5">
        <h2 className="label mb-3">AniList sync</h2>
        {library && (
          <p className="mb-4 text-sm text-mute">
            Last synced <span className="text-ink">@{library.user.name}</span>
            {library.demo && " (demo data)"} on {new Date(library.syncedAt).toLocaleString()}.
          </p>
        )}
        <SyncForm key={library?.user.name ?? "none"} defaultUser={library && !library.demo ? library.user.name : ""} />
      </section>

      <section className="panel p-5">
        <h2 className="label mb-3">Backup</h2>
        <p className="mb-4 text-sm text-mute">
          Your shelf and wishlist are saved on the server, tied to this browser. Export a backup to move them to
          another device or keep them safe. AniList lists aren&apos;t included; just sync again.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={download}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
        </div>
        {message && (
          <p className={`mt-3 font-mono text-xs ${message.ok ? "text-neon-green" : "text-neon-pink"}`}>{message.text}</p>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="label mb-3">Link another device</h2>
        <p className="mb-4 text-sm text-mute">
          Open this profile on your phone or another browser without a backup file: show a code here and enter it in
          Settings over there. A code works once and expires after 10 minutes.
        </p>
        {linkCode ? (
          <div className="mb-4">
            <p className="font-mono text-3xl font-bold tracking-[0.2em] text-neon-cyan" aria-live="polite">
              {linkCode}
            </p>
            <p className="mt-2 text-sm text-mute">Expires in 10 minutes. Enter it in Settings on the other device.</p>
            <button type="button" className="btn btn-ghost mt-3 px-3 py-1" onClick={showLinkCode} disabled={linking}>
              New code
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost mb-4" onClick={showLinkCode} disabled={linking}>
            Show a link code
          </button>
        )}
        <form onSubmit={onLink} className="border-t border-line/60 pt-4">
          <label htmlFor="link-code" className="label mb-2 block">
            Code from another device
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="link-code"
              className="input"
              placeholder="ABCD-EFGH"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              disabled={linking}
            />
            <button type="submit" className="btn btn-primary shrink-0" disabled={linking || !codeInput.trim()}>
              {linking ? "Linking…" : "Link"}
            </button>
          </div>
        </form>
        {linkMessage && (
          <p className={`mt-3 font-mono text-xs ${linkMessage.ok ? "text-neon-green" : "text-neon-pink"}`} aria-live="polite">
            {linkMessage.text}
          </p>
        )}
      </section>

      <section className="panel border-neon-pink/40 p-5">
        <h2 className="label mb-3 !text-neon-pink">Danger zone</h2>
        <p className="mb-4 text-sm text-mute">
          Deletes the synced lists, your shelf and your wishlist from the server, and forgets this browser.
        </p>
        <button
          type="button"
          className="btn border-neon-pink text-neon-pink hover:bg-neon-pink/10"
          onClick={() => {
            if (confirm("Erase all KitsuneSync data for this browser?")) {
              resetAll();
              setMessage({ ok: true, text: "All data erased." });
            }
          }}
        >
          Erase everything
        </button>
      </section>
    </div>
  );
}
