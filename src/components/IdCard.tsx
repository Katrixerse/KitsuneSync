import Image from "next/image";
import type { AniListUser } from "@/lib/anilist/types";
import {
  assignRole,
  cardSerial,
  computeLevel,
  daysWatched,
  hashString,
  type ProfileStats,
} from "@/lib/profile";
import type { ShelfStats } from "@/lib/shelf";
import { CatMascot } from "./CatMascot";

function Barcode({ seed }: { seed: string }) {
  let h = hashString(seed);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  while (x < 160) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const w = 1 + (h % 3);
    bars.push({ x, w });
    x += w + 1 + ((h >>> 4) % 3);
  }
  return (
    <svg viewBox="0 0 160 28" className="h-7 w-40" aria-hidden preserveAspectRatio="none">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={28} fill="currentColor" />
      ))}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="label !text-[9px]">{label}</div>
      <div className="font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

interface IdCardProps {
  user: AniListUser;
  stats: ProfileStats;
  shelf: ShelfStats;
  syncedAt: string;
}

export function IdCard({ user, stats, shelf, syncedAt }: IdCardProps) {
  const role = assignRole(stats);
  const { level, rank, progress } = computeLevel(stats);
  const serial = cardSerial(user.id, user.name);
  const issued = new Date(syncedAt).toISOString().slice(0, 10).replaceAll("-", ".");

  return (
    <article
      aria-label={`${user.name}'s KitsuneSync ID card`}
      className="panel overflow-hidden border-neon-cyan/40 bg-gradient-to-br from-panel-2 via-panel to-void p-5 shadow-[0_0_40px_-10px] shadow-neon-cyan/40 sm:p-6"
    >
      <div className="holo pointer-events-none absolute inset-0" aria-hidden />
      <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />

      <header className="relative flex items-center justify-between border-b border-line pb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-neon-cyan">
          Night City Otaku Registry
        </div>
        <div className="font-mono text-[10px] text-neon-pink">{serial}</div>
      </header>

      <div className="relative mt-4 grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-row items-center gap-4 sm:flex-col sm:items-stretch">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden border border-neon-pink/60 bg-void sm:h-32 sm:w-32">
            {user.avatar ? (
              <Image src={user.avatar} alt="" fill sizes="128px" className="object-cover" />
            ) : (
              <CatMascot mood="smug" className="h-full w-full p-2" />
            )}
            <div className="scanlines absolute inset-0" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest">
              <span className="text-neon-yellow">LVL {level}</span>
              <span className="text-mute">{rank}</span>
            </div>
            <div className="mt-1 h-1.5 bg-line">
              <div className="h-full bg-neon-yellow" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="label">Handle</div>
          <h2 className="glitch-text truncate font-display text-3xl font-bold sm:text-4xl">{user.name}</h2>
          <div className="mt-1 font-display text-lg font-semibold text-neon-pink">{role.name}</div>
          <p className="text-sm text-mute">{role.tagline}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Anime" value={stats.animeCount} />
            <Stat label="Manga" value={stats.mangaCount} />
            <Stat label="Days" value={daysWatched(stats)} />
            <Stat label="Mean" value={stats.meanScore ?? "—"} />
          </div>
        </div>
      </div>

      <div className="relative mt-5">
        <div className="label mb-2">Installed implants</div>
        <ul className="flex flex-wrap gap-1.5">
          {stats.topGenres.length ? (
            stats.topGenres.map((g) => (
              <li
                key={g.genre}
                className="border border-neon-cyan/40 bg-neon-cyan/5 px-2 py-0.5 font-mono text-[11px] text-neon-cyan"
              >
                {g.genre} <span className="text-mute">{Math.round(g.share * 100)}%</span>
              </li>
            ))
          ) : (
            <li className="font-mono text-[11px] text-mute">none detected</li>
          )}
        </ul>
      </div>

      <footer className="relative mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
        <div className="font-mono text-[10px] uppercase leading-relaxed tracking-widest text-mute">
          <div>
            Issued <span className="text-ink">{issued}</span>
          </div>
          <div>
            Shelf <span className="text-ink">{shelf.volumes} vol</span> · {shelf.series} series
          </div>
        </div>
        <div className="text-ink/80">
          <Barcode seed={serial} />
        </div>
      </footer>
    </article>
  );
}
