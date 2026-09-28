"use client";

import { useMemo, useState } from "react";
import { Cover } from "@/components/Cover";
import { RequireLibrary } from "@/components/RequireLibrary";
import { STATUS_LABELS, type Library, type ListEntry, type ListStatus } from "@/lib/anilist/types";
import { seriesFromEntry, type Shelf } from "@/lib/shelf";
import { upsertSeries } from "@/lib/store";

type Tab = "anime" | "manga";
type Sort = "updated" | "score" | "title" | "year";

const STATUS_ORDER: ListStatus[] = ["CURRENT", "REPEATING", "COMPLETED", "PAUSED", "DROPPED", "PLANNING"];

export function Lists() {
  return <RequireLibrary>{({ library, shelf }) => <ListsView library={library} shelf={shelf} />}</RequireLibrary>;
}

function ListsView({ library, shelf }: { library: Library; shelf: Shelf }) {
  const [tab, setTab] = useState<Tab>("anime");
  const [status, setStatus] = useState<ListStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("updated");

  const entries = library[tab];

  const counts = useMemo(() => {
    const c = new Map<ListStatus, number>();
    for (const e of entries) c.set(e.status, (c.get(e.status) ?? 0) + 1);
    return c;
  }, [entries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = entries.filter(
      (e) =>
        (status === "ALL" || e.status === status) &&
        (!q || e.media.title.toLowerCase().includes(q) || e.media.titleNative?.includes(q)),
    );
    const sorters: Record<Sort, (a: ListEntry, b: ListEntry) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      score: (a, b) => b.score - a.score,
      title: (a, b) => a.media.title.localeCompare(b.media.title),
      year: (a, b) => (b.media.year ?? 0) - (a.media.year ?? 0),
    };
    return [...filtered].sort(sorters[sort]);
  }, [entries, status, query, sort]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Synced {new Date(library.syncedAt).toLocaleString()}</p>
          <h1 className="font-display text-3xl font-bold">Lists</h1>
        </div>
        <div className="flex border border-line" role="tablist">
          {(["anime", "manga"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setStatus("ALL");
              }}
              className={`px-4 py-2 font-mono text-xs uppercase tracking-widest ${
                tab === t ? "bg-neon-pink text-void" : "text-mute hover:text-ink"
              }`}
            >
              {t} <span className="opacity-70">{library[t].length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={status === "ALL"} onClick={() => setStatus("ALL")}>
            All {entries.length}
          </Chip>
          {STATUS_ORDER.filter((s) => counts.get(s)).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {STATUS_LABELS[s][tab]} {counts.get(s)}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 md:ml-auto">
          <input
            className="input md:w-56"
            placeholder="Search titles"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search titles"
          />
          <select
            className="input w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort by"
          >
            <option value="updated">Recent</option>
            <option value="score">Score</option>
            <option value="title">Title</option>
            <option value="year">Year</option>
          </select>
        </div>
      </div>

      {visible.length ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((e) => (
            <EntryCard key={e.id} entry={e} shelved={!!shelf[e.media.id]} />
          ))}
        </ul>
      ) : (
        <p className="panel p-8 text-center text-mute">No entries match.</p>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
        active ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan" : "border-line text-mute hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function EntryCard({ entry, shelved }: { entry: ListEntry; shelved: boolean }) {
  const { media } = entry;
  const isManga = media.type === "MANGA";
  const total = isManga ? media.chapters : media.episodes;
  const pct = total ? Math.min(1, entry.progress / total) : null;

  return (
    <li className="group flex flex-col">
      <a href={media.siteUrl} target="_blank" rel="noreferrer" className="relative block">
        <Cover
          title={media.title}
          src={media.cover}
          color={media.color}
          sizes="(min-width: 1024px) 16vw, (min-width: 640px) 30vw, 45vw"
          className="transition group-hover:brightness-110"
        />
        {entry.score > 0 && (
          <span className="absolute right-1 top-1 bg-void/85 px-1.5 py-0.5 font-mono text-[11px] text-neon-yellow">
            ★ {entry.score}
          </span>
        )}
        {pct !== null && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-void/70">
            <span className="block h-full bg-neon-cyan" style={{ width: `${pct * 100}%` }} />
          </span>
        )}
      </a>
      <div className="mt-1.5 line-clamp-2 text-sm leading-snug" title={media.title}>
        {media.title}
      </div>
      <div className="font-mono text-[10px] text-mute">
        {isManga ? "ch" : "ep"} {entry.progress}
        {total ? `/${total}` : ""}
        {media.year ? ` · ${media.year}` : ""}
      </div>
      {isManga && (
        <button
          type="button"
          disabled={shelved}
          onClick={() => upsertSeries(seriesFromEntry(entry))}
          className={`mt-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
            shelved
              ? "border-neon-green/40 text-neon-green"
              : "border-line text-mute hover:border-neon-pink hover:text-neon-pink"
          }`}
        >
          {shelved ? "✔ On shelf" : "+ Shelf"}
        </button>
      )}
    </li>
  );
}
