"use client";

import { useMemo, useState } from "react";
import { Cover } from "@/components/Cover";
import { RequireLibrary } from "@/components/RequireLibrary";
import type { Library } from "@/lib/anilist/types";
import { addVolumes, formatRanges, seriesFromEntry, type Shelf } from "@/lib/shelf";
import { addManualWish, dismissWish, restoreDismissed, upsertSeries, type KitsuneState } from "@/lib/store";
import {
  WISH_KIND_LABELS,
  buildWishlist,
  wishlistToText,
  type WishItem,
  type WishKind,
} from "@/lib/wishlist";

const KIND_ORDER: WishKind[] = ["gap", "next", "manual", "start", "planning"];

export function Wishlist() {
  return <RequireLibrary>{(state) => <WishlistView {...state} />}</RequireLibrary>;
}

function WishlistView({ library, shelf, wishlist }: KitsuneState & { library: Library }) {
  const items = useMemo(() => buildWishlist(shelf, library.manga, wishlist), [shelf, library.manga, wishlist]);
  const [copied, setCopied] = useState(false);

  const groups = KIND_ORDER.map((kind) => ({ kind, items: items.filter((i) => i.kind === kind) })).filter(
    (g) => g.items.length,
  );

  async function copy() {
    await navigator.clipboard.writeText(wishlistToText(items));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Auto-generated from your shelf and lists</p>
          <h1 className="font-display text-3xl font-bold">Wishlist</h1>
        </div>
        <div className="flex gap-2">
          {wishlist.dismissed.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={restoreDismissed}>
              Restore {wishlist.dismissed.length} hidden
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={copy} disabled={!items.length}>
            {copied ? "Copied ✔" : "Copy as text"}
          </button>
        </div>
      </div>

      <ManualAdd />

      {groups.length ? (
        groups.map((g) => (
          <section key={g.kind}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="font-display text-xl font-semibold">{WISH_KIND_LABELS[g.kind].title}</h2>
              <span className="font-mono text-[11px] text-mute">{WISH_KIND_LABELS[g.kind].blurb}</span>
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {g.items.map((item) => (
                <WishCard key={item.key} item={item} shelf={shelf} library={library} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="panel p-8 text-center text-mute">
          Nothing to buy. Add series to your shelf, or rate some manga on AniList, and this fills itself.
        </p>
      )}
    </div>
  );
}

/** "Got it": marks the volumes owned, adding the series to the shelf if needed. */
function acquire(item: WishItem, shelf: Shelf, library: Library, volumes = item.volumes) {
  if (item.kind === "manual") return dismissWish(item.key);
  if (item.mediaId === null) return;
  const existing = shelf[item.mediaId];
  if (existing) return upsertSeries(addVolumes(existing, volumes));
  const entry = library.manga.find((e) => e.media.id === item.mediaId);
  if (entry) upsertSeries(addVolumes(seriesFromEntry(entry), volumes));
}

function WishCard({ item, shelf, library }: { item: WishItem; shelf: Shelf; library: Library }) {
  const clickable = item.kind === "gap" || item.kind === "next";
  return (
    <li className="panel flex gap-3 p-3">
      <Cover title={item.title} src={item.cover} color={item.color} sizes="56px" className="w-14 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display font-semibold">{item.title}</div>
        {item.volumes.length > 0 && (
          <div className="font-mono text-xs text-neon-cyan">vol. {formatRanges(item.volumes)}</div>
        )}
        {item.reason && <p className="mt-0.5 text-xs text-mute">{item.reason}</p>}
        {clickable && item.volumes.length > 1 && item.volumes.length <= 24 && (
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Mark a single volume as bought">
            {item.volumes.map((v) => (
              <button
                key={v}
                type="button"
                title={`Bought vol. ${v}`}
                onClick={() => acquire(item, shelf, library, [v])}
                className="h-6 min-w-6 border border-line px-1 font-mono text-[10px] text-mute hover:border-neon-cyan hover:text-neon-cyan"
              >
                {v}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn btn-ghost !px-2 !py-1 !text-[10px]" onClick={() => acquire(item, shelf, library)}>
            {item.kind === "manual" ? "✔ Done" : item.volumes.length > 1 ? "✔ Got all" : "✔ Got it"}
          </button>
          {item.kind !== "manual" && (
            <button
              type="button"
              className="px-2 font-mono text-[10px] uppercase tracking-widest text-mute hover:text-neon-pink"
              onClick={() => dismissWish(item.key)}
            >
              Hide
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ManualAdd() {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      className="panel flex flex-col gap-2 p-4 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        addManualWish(title.trim(), note.trim());
        setTitle("");
        setNote("");
      }}
    >
      <input className="input" placeholder="Pin something: art book, box set, figure…" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Wishlist item" />
      <input className="input sm:w-64" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <button className="btn btn-primary" disabled={!title.trim()}>
        Pin
      </button>
    </form>
  );
}
