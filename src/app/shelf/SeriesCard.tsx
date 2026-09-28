"use client";

import { useState } from "react";
import { Cover } from "@/components/Cover";
import {
  EDITION_LABELS,
  addVolumes,
  completion,
  displayedVolumeCount,
  formatRanges,
  gapVolumes,
  isComplete,
  parseRanges,
  setTotalVolumes,
  toggleVolume,
  type Edition,
  type ShelfSeries,
} from "@/lib/shelf";
import { removeSeries, upsertSeries } from "@/lib/store";

export function SeriesCard({ series }: { series: ShelfSeries }) {
  const [editing, setEditing] = useState(false);
  const [bulk, setBulk] = useState("");

  const owned = new Set(series.owned);
  const gaps = new Set(gapVolumes(series));
  const count = displayedVolumeCount(series);
  const done = isComplete(series);
  const pct = completion(series);

  function applyBulk(e: React.FormEvent) {
    e.preventDefault();
    const volumes = parseRanges(bulk);
    if (volumes.length) upsertSeries(addVolumes(series, volumes));
    setBulk("");
  }

  return (
    <li className={`panel flex gap-4 p-4 ${done ? "border-neon-green/40" : ""}`}>
      <Cover title={series.title} src={series.cover} color={series.color} sizes="80px" className="w-16 shrink-0 sm:w-20" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold">
              {series.siteUrl ? (
                <a href={series.siteUrl} target="_blank" rel="noreferrer" className="hover:text-neon-cyan">
                  {series.title}
                </a>
              ) : (
                series.title
              )}
            </h3>
            <p className="font-mono text-[11px] text-mute">
              {series.owned.length}
              {series.totalVolumes ? ` / ${series.totalVolumes}` : ""} vol · {EDITION_LABELS[series.edition]}
              {series.ongoing && <span className="text-neon-yellow"> · ongoing</span>}
              {done && <span className="text-neon-green"> · complete</span>}
              {gaps.size > 0 && <span className="text-neon-pink"> · missing {formatRanges([...gaps])}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="font-mono text-[11px] text-neon-cyan hover:underline"
            aria-expanded={editing}
          >
            {editing ? "done" : "edit"}
          </button>
        </div>

        {pct !== null && (
          <div className="mt-2 h-1 bg-line" aria-hidden>
            <div className={`h-full ${done ? "bg-neon-green" : "bg-neon-cyan"}`} style={{ width: `${pct * 100}%` }} />
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label={`${series.title} volumes`}>
          {Array.from({ length: count }, (_, i) => i + 1).map((v) => {
            const has = owned.has(v);
            const gap = gaps.has(v);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={has}
                aria-label={`Volume ${v}${has ? ", owned" : gap ? ", missing" : ""}`}
                onClick={() => upsertSeries(toggleVolume(series, v))}
                className={`h-8 w-8 border font-mono text-[11px] tabular-nums transition ${
                  has
                    ? "border-neon-cyan bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30"
                    : gap
                      ? "border-dashed border-neon-pink text-neon-pink hover:bg-neon-pink/10"
                      : "border-line text-mute hover:border-mute hover:text-ink"
                }`}
              >
                {v}
              </button>
            );
          })}
        </div>

        {editing && (
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="label">Total volumes</span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="unknown"
                defaultValue={series.totalVolumes ?? ""}
                onBlur={(e) => {
                  const n = e.target.value ? Number(e.target.value) : null;
                  upsertSeries(setTotalVolumes(series, n));
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Edition</span>
              <select
                className="input"
                value={series.edition}
                onChange={(e) => upsertSeries({ ...series, edition: e.target.value as Edition })}
              >
                {Object.entries(EDITION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <form onSubmit={applyBulk} className="flex flex-col gap-1">
              <label htmlFor={`bulk-${series.mediaId}`} className="label">
                Mark owned
              </label>
              <div className="flex gap-1">
                <input
                  id={`bulk-${series.mediaId}`}
                  className="input"
                  placeholder="1-5, 7"
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                />
                <button className="btn btn-ghost !px-2">Add</button>
              </div>
            </form>
            <div className="flex flex-col gap-1">
              <span className="label">Status</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost flex-1 !px-2"
                  aria-pressed={series.ongoing}
                  onClick={() => upsertSeries({ ...series, ongoing: !series.ongoing })}
                >
                  {series.ongoing ? "Ongoing" : "Finished"}
                </button>
                <button
                  type="button"
                  className="btn flex-1 border-neon-pink/50 !px-2 text-neon-pink hover:bg-neon-pink/10"
                  onClick={() => {
                    if (confirm(`Remove ${series.title} from your shelf?`)) removeSeries(series.mediaId);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
            <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
              <span className="label">Notes</span>
              <input
                className="input"
                placeholder="Where you bought it, condition, signed copy…"
                defaultValue={series.notes}
                onBlur={(e) => upsertSeries({ ...series, notes: e.target.value })}
              />
            </label>
          </div>
        )}
        {!editing && series.notes && <p className="mt-2 text-xs text-mute">{series.notes}</p>}
      </div>
    </li>
  );
}
