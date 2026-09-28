"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CatMascot } from "@/components/CatMascot";
import { Cover } from "@/components/Cover";
import { IdCard } from "@/components/IdCard";
import { RequireLibrary } from "@/components/RequireLibrary";
import type { ListEntry } from "@/lib/anilist/types";
import { catCommentary, computeStats, daysWatched, type CatLine } from "@/lib/profile";
import { shelfStats } from "@/lib/shelf";
import type { KitsuneState } from "@/lib/store";
import type { Library } from "@/lib/anilist/types";
import { buildWishlist } from "@/lib/wishlist";

export function Dashboard() {
  return <RequireLibrary>{(state) => <DashboardView {...state} />}</RequireLibrary>;
}

function DashboardView({ library, shelf, wishlist }: KitsuneState & { library: Library }) {
  const stats = useMemo(() => computeStats(library), [library]);
  const shelfInfo = useMemo(() => shelfStats(shelf), [shelf]);
  const wishCount = useMemo(
    () => buildWishlist(shelf, library.manga, wishlist).length,
    [shelf, library.manga, wishlist],
  );
  const quips = useMemo(
    () => catCommentary(stats, shelfInfo, library.user.name),
    [stats, shelfInfo, library.user.name],
  );

  const watching = library.anime.filter((e) => e.status === "CURRENT" || e.status === "REPEATING");
  const reading = library.manga.filter((e) => e.status === "CURRENT" || e.status === "REPEATING");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <IdCard user={library.user} stats={stats} shelf={shelfInfo} syncedAt={library.syncedAt} />
        <CatPanel quips={quips} />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Episodes" value={stats.episodes.toLocaleString()} />
        <Tile label="Days watched" value={daysWatched(stats)} />
        <Tile label="Chapters" value={stats.chapters.toLocaleString()} />
        <Tile label="Volumes owned" value={shelfInfo.volumes} href="/shelf" />
        <Tile label="On wishlist" value={wishCount} href="/wishlist" accent />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <section className="panel p-5">
          <h2 className="label mb-4">Genre breakdown</h2>
          <ul className="flex flex-col gap-3">
            {stats.topGenres.map((g) => (
              <li key={g.genre}>
                <div className="flex justify-between font-mono text-xs">
                  <span>{g.genre}</span>
                  <span className="text-mute">{g.count}</span>
                </div>
                <div className="mt-1 h-2 bg-line">
                  <div
                    className="h-full bg-gradient-to-r from-neon-pink to-neon-violet"
                    style={{ width: `${Math.round(g.share * 100)}%` }}
                  />
                </div>
              </li>
            ))}
            {!stats.topGenres.length && <li className="text-sm text-mute">Nothing watched yet.</li>}
          </ul>
        </section>

        <section className="flex flex-col gap-6">
          <Strip title="Watching" entries={watching} unit="ep" />
          <Strip title="Reading" entries={reading} unit="ch" />
        </section>
      </div>
    </div>
  );
}

function CatPanel({ quips }: { quips: CatLine[] }) {
  const [index, setIndex] = useState(0);
  const current = quips[index % Math.max(quips.length, 1)];

  return (
    <section className="panel flex flex-col p-5" aria-label="Cat commentary">
      <h2 className="label">Resident critic</h2>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4">
        <div className="relative w-full border border-neon-cyan/40 bg-void/60 p-4 font-mono text-sm leading-relaxed">
          <span aria-live="polite">{current?.text ?? "…"}</span>
          <span
            className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-neon-cyan/40 bg-void"
            aria-hidden
          />
        </div>
        <button
          type="button"
          onClick={() => setIndex((i) => i + 1)}
          className="group"
          aria-label="Next comment"
          title="Poke the cat"
        >
          <CatMascot mood={current?.mood} className="h-36 w-36 transition group-hover:scale-105 group-active:scale-95" />
        </button>
      </div>
      {quips.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {quips.map((q, i) => (
            <button
              key={q.id}
              type="button"
              aria-label={`Comment ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 w-6 ${i === index % quips.length ? "bg-neon-cyan" : "bg-line hover:bg-mute"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className={`mt-1 font-display text-3xl font-bold tabular-nums ${accent ? "text-neon-pink" : ""}`}>
        {value}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="panel block p-4 transition hover:border-neon-cyan">
      {body}
    </Link>
  ) : (
    <div className="panel p-4">{body}</div>
  );
}

function Strip({ title, entries, unit }: { title: string; entries: ListEntry[]; unit: string }) {
  return (
    <div className="panel p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="label">{title}</h2>
        <Link href="/lists" className="font-mono text-[11px] text-neon-cyan hover:underline">
          all lists →
        </Link>
      </div>
      {entries.length ? (
        <ul className="flex gap-3 overflow-x-auto pb-1">
          {entries.slice(0, 10).map((e) => {
            const total = e.media.episodes ?? e.media.chapters;
            return (
              <li key={e.id} className="w-24 shrink-0">
                <a href={e.media.siteUrl} target="_blank" rel="noreferrer">
                  <Cover title={e.media.title} src={e.media.cover} color={e.media.color} sizes="96px" />
                </a>
                <div className="mt-1 truncate text-xs" title={e.media.title}>
                  {e.media.title}
                </div>
                <div className="font-mono text-[10px] text-mute">
                  {unit} {e.progress}
                  {total ? `/${total}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-mute">Nothing in progress.</p>
      )}
    </div>
  );
}
