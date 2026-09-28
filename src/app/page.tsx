import { CatMascot } from "@/components/CatMascot";
import { HomeSync } from "./HomeSync";

const FEATURES = [
  {
    kicker: "01 / Sync",
    title: "Your AniList, mirrored",
    body: "Pull every anime and manga entry from a public AniList profile in one request. Re-sync any time; AniList stays the source of truth.",
  },
  {
    kicker: "02 / Shelf",
    title: "Physical manga, volume by volume",
    body: "AniList tracks what you've read, not what you own. Tap volumes to mark them owned, spot gaps, and log editions like omnibus or deluxe.",
  },
  {
    kicker: "03 / Wishlist",
    title: "A wishlist that fills itself",
    body: "Missing volumes, newly released ones, and manga you rated highly but don't own get queued up for you automatically.",
  },
  {
    kicker: "04 / ID",
    title: "A cyberpunk ID card",
    body: "Your stats as a Night City ID with a role, a level and genre implants. A cat mascot reads your list and has opinions about it.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-12">
      <section className="grid items-center gap-8 pt-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="label text-neon-cyan">AniList companion · anime + manga</p>
          <h1 className="glitch-text mt-3 font-display text-5xl font-bold leading-[1.05] sm:text-6xl">
            Kitsune<span className="text-neon-pink">Sync</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-mute">
            Sync your AniList lists, then track the stuff AniList doesn&apos;t: the manga on your actual shelf, the
            volumes you&apos;re missing, and what to buy next.
          </p>
          <div className="panel mt-8 max-w-xl p-5">
            <HomeSync />
          </div>
        </div>
        <div className="relative mx-auto hidden md:block">
          <div className="absolute -inset-6 rounded-full bg-neon-violet/20 blur-3xl" aria-hidden />
          <CatMascot mood="excited" className="relative h-64 w-64" />
          <div className="panel absolute -left-24 top-4 max-w-48 p-3 font-mono text-xs">
            Sync your list. I&apos;ll judge it. Politely. Mostly.
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.kicker} className="panel p-5">
            <div className="label text-neon-pink">{f.kicker}</div>
            <h2 className="mt-2 font-display text-xl font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
