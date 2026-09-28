"use client";

import { useMemo, useState } from "react";
import { RequireLibrary } from "@/components/RequireLibrary";
import type { Library } from "@/lib/anilist/types";
import {
  completion,
  gapVolumes,
  isComplete,
  seriesFromEntry,
  shelfStats,
  type Shelf,
  type ShelfSeries,
} from "@/lib/shelf";
import { upsertSeries } from "@/lib/store";
import { SeriesCard } from "./SeriesCard";

type Filter = "all" | "collecting" | "gaps" | "complete";

const FILTERS: { id: Filter; label: string; test: (s: ShelfSeries) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "collecting", label: "Collecting", test: (s) => !isComplete(s) },
  { id: "gaps", label: "Has gaps", test: (s) => gapVolumes(s).length > 0 },
  { id: "complete", label: "Complete", test: isComplete },
];

export function ShelfView() {
  return <RequireLibrary>{({ library, shelf }) => <ShelfPageView library={library} shelf={shelf} />}</RequireLibrary>;
}

function ShelfPageView({ library, shelf }: { library: Library; shelf: Shelf }) {
  const [filter, setFilter] = useState<Filter>("all");
  const stats = useMemo(() => shelfStats(shelf), [shelf]);

  const series = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return Object.values(shelf)
      .filter(test)
      .sort((a, b) => (completion(a) ?? 0) - (completion(b) ?? 0) || a.title.localeCompare(b.title));
  }, [shelf, filter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Physical collection</p>
          <h1 className="font-display text-3xl font-bold">Shelf</h1>
        </div>
        <dl className="flex gap-6 font-mono text-xs">
          {[
            ["Series", stats.series],
            ["Volumes", stats.volumes],
            ["Complete", stats.complete],
            ["Gaps", stats.gaps],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="label !text-[10px]">{k}</dt>
              <dd className="font-display text-2xl font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <AddSeries library={library} shelf={shelf} />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`border px-3 py-1 font-mono text-[11px] uppercase tracking-wider ${
              filter === f.id ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan" : "border-line text-mute hover:text-ink"
            }`}
          >
            {f.label} {Object.values(shelf).filter(f.test).length}
          </button>
        ))}
      </div>

      {series.length ? (
        <ul className="flex flex-col gap-4">
          {series.map((s) => (
            <SeriesCard key={s.mediaId} series={s} />
          ))}
        </ul>
      ) : (
        <p className="panel p-8 text-center text-mute">
          {stats.series ? "Nothing matches this filter." : "Your shelf is empty. Add a series above."}
        </p>
      )}
    </div>
  );
}

function AddSeries({ library, shelf }: { library: Library; shelf: Shelf }) {
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return library.manga
      .filter((e) => !shelf[e.media.id] && e.media.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [library.manga, shelf, query]);

  function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const n = Number(total);
    upsertSeries({
      mediaId: -Date.now(),
      title: title.trim(),
      cover: null,
      color: null,
      siteUrl: null,
      totalVolumes: Number.isFinite(n) && n > 0 ? Math.floor(n) : null,
      owned: [],
      edition: "standard",
      ongoing: false,
      addedAt: new Date().toISOString(),
      notes: "",
    });
    setTitle("");
    setTotal("");
  }

  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="label">Add a series</h2>
        <button type="button" onClick={() => setManual((m) => !m)} className="font-mono text-[11px] text-neon-cyan hover:underline">
          {manual ? "search my AniList manga" : "not on AniList? add by hand"}
        </button>
      </div>
      {manual ? (
        <form onSubmit={addManual} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
          <input
            className="input sm:w-40"
            placeholder="Total volumes"
            inputMode="numeric"
            value={total}
            onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))}
            aria-label="Total volumes"
          />
          <button className="btn btn-primary" disabled={!title.trim()}>
            Add
          </button>
        </form>
      ) : (
        <div className="mt-3">
          <input
            className="input"
            placeholder="Search your synced manga…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search your synced manga"
          />
          {query && (
            <ul className="mt-2 flex flex-col divide-y divide-line border border-line">
              {matches.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate text-sm">
                    {e.media.title}
                    <span className="ml-2 font-mono text-[10px] text-mute">
                      {e.media.volumes ? `${e.media.volumes} vol` : e.media.status?.toLowerCase()}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost !px-2 !py-1"
                    onClick={() => {
                      upsertSeries(seriesFromEntry(e));
                      setQuery("");
                    }}
                  >
                    + Add
                  </button>
                </li>
              ))}
              {!matches.length && <li className="px-3 py-2 text-sm text-mute">No unshelved manga match.</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
