"use client";

import { useRef, useState } from "react";
import { SyncForm } from "@/components/SyncForm";
import { exportBackup, importBackup, resetAll, useKitsune } from "@/lib/store";

export function Settings() {
  const { library, hydrated } = useKitsune();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-3xl font-bold">Settings</h1>

      <section className="panel p-5">
        <h2 className="label mb-3">AniList sync</h2>
        {hydrated && library && (
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
          Your shelf and wishlist are stored only in this browser. Export a backup to move them to another device or
          keep them safe. AniList lists aren&apos;t included; just sync again.
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

      <section className="panel border-neon-pink/40 p-5">
        <h2 className="label mb-3 !text-neon-pink">Danger zone</h2>
        <p className="mb-4 text-sm text-mute">Wipes the synced lists, your shelf and your wishlist from this browser.</p>
        <button
          type="button"
          className="btn border-neon-pink text-neon-pink hover:bg-neon-pink/10"
          onClick={() => {
            if (confirm("Erase all KitsuneSync data from this browser?")) {
              resetAll();
              setMessage({ ok: true, text: "All local data erased." });
            }
          }}
        >
          Erase everything
        </button>
      </section>
    </div>
  );
}
