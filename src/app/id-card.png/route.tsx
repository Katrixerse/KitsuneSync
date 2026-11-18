import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { AniListUser } from "@/lib/anilist/types";
import { BARCODE_WIDTH, barcodeBars, issuedOn } from "@/lib/id-card";
import {
  assignRole,
  cardSerial,
  computeLevel,
  computeStats,
  daysWatched,
  type ProfileStats,
} from "@/lib/profile";
import { loadCurrentState } from "@/lib/session";
import { shelfStats, type ShelfStats } from "@/lib/shelf";

/**
 * The dashboard's ID card (components/IdCard.tsx) as a 1200×630 PNG to share.
 * Satori renders the JSX below and only knows flexbox and inline styles: no
 * Tailwind classes, no grid, and every box with more than one child says
 * display: flex. Text sticks to Latin glyphs, because satori fetches any
 * missing glyph from Google Fonts at render time.
 */

const WIDTH = 1200;
const HEIGHT = 630;

// Same palette as globals.css.
const C = {
  void: "#07070d",
  panel: "#10101c",
  panel2: "#171728",
  line: "#2a2a45",
  ink: "#e8e8f4",
  mute: "#8b8ba7",
  pink: "#ff2a6d",
  cyan: "#05d9e8",
  yellow: "#f9f002",
};
const mono = { fontFamily: "JetBrains Mono" };
const display = { fontFamily: "Chakra Petch" };
const label = { ...mono, fontSize: 14, letterSpacing: 3, textTransform: "uppercase" as const, color: C.mute };

// The card depends on the profile cookie, so no shared cache may keep it.
const NO_STORE = { "Cache-Control": "private, no-store" };

/* ---------- fonts ---------- */

type Fonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

const FONT_DIR = join(process.cwd(), "src/app/id-card.png/fonts");
const FONT_FILES: [name: string, file: string, weight: 400 | 600 | 700][] = [
  ["Chakra Petch", "ChakraPetch-Regular.ttf", 400],
  ["Chakra Petch", "ChakraPetch-SemiBold.ttf", 600],
  ["Chakra Petch", "ChakraPetch-Bold.ttf", 700],
  ["JetBrains Mono", "JetBrainsMono-Regular.ttf", 400],
];

let fonts: Promise<Fonts> | undefined;

/** The faces the site uses (app/layout.tsx), read once per process. Without them satori falls back to its bundled font. */
function loadFonts(): Promise<Fonts> {
  fonts ??= Promise.all(
    FONT_FILES.map(async ([name, file, weight]) => ({
      name,
      data: await readFile(join(FONT_DIR, file)),
      weight,
      style: "normal" as const,
    })),
  ).catch((err: unknown) => {
    console.error("ID card fonts not found, using the default font", err);
    return undefined;
  });
  return fonts;
}

/* ---------- avatar ---------- */

// Only the AniList CDN, like images.remotePatterns: the URL comes from the stored library.
const AVATAR_CDN = "https://s4.anilist.co/";

/**
 * The avatar as a data URI, or null to draw the placeholder. Fetched here
 * rather than by satori so a slow or broken image can't break the card.
 */
async function loadAvatar(url: string | null): Promise<string | null> {
  if (!url?.startsWith(AVATAR_CDN)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch (err) {
    console.error("Avatar fetch failed", err);
    return null;
  }
}

/* ---------- route ---------- */

export async function GET() {
  const { library, shelf } = await loadCurrentState();
  if (!library) return Response.json({ error: "Sync first." }, { status: 404, headers: NO_STORE });

  const card = {
    user: library.user,
    stats: computeStats(library),
    shelf: shelfStats(shelf),
    syncedAt: library.syncedAt,
  };
  const [faces, avatar] = await Promise.all([loadFonts(), loadAvatar(library.user.avatar)]);

  try {
    let png: ArrayBuffer;
    try {
      png = await render({ ...card, avatar }, faces);
    } catch (err) {
      if (!avatar) throw err;
      // An avatar satori can't decode shouldn't cost the whole card.
      console.error("ID card render failed with the avatar, retrying without it", err);
      png = await render({ ...card, avatar: null }, faces);
    }
    return new Response(png, {
      headers: {
        ...NO_STORE,
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="kitsunesync-id.png"',
      },
    });
  } catch (err) {
    console.error("ID card render failed", err);
    return Response.json({ error: "Couldn't render the card." }, { status: 500, headers: NO_STORE });
  }
}

/** Renders to bytes before answering, so a satori error becomes an error response instead of a broken stream. */
function render(props: CardProps, faces: Fonts): Promise<ArrayBuffer> {
  return new ImageResponse(<Card {...props} />, { width: WIDTH, height: HEIGHT, fonts: faces }).arrayBuffer();
}

/* ---------- card ---------- */

interface CardProps {
  user: AniListUser;
  stats: ProfileStats;
  shelf: ShelfStats;
  syncedAt: string;
  avatar: string | null;
}

function Card({ user, stats, shelf, syncedAt, avatar }: CardProps) {
  const role = assignRole(stats);
  const { level, rank, progress } = computeLevel(stats);
  const serial = cardSerial(user.id, user.name);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 44,
        color: C.ink,
        background: `linear-gradient(135deg, ${C.panel2} 0%, ${C.panel} 55%, ${C.void} 100%)`,
        border: "2px solid rgba(5, 217, 232, 0.4)",
        ...display,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 18,
          borderBottom: `1px solid ${C.line}`,
          ...mono,
          fontSize: 18,
          textTransform: "uppercase",
        }}
      >
        <div style={{ color: C.cyan, letterSpacing: 7 }}>Night City Otaku Registry</div>
        <div style={{ color: C.pink, letterSpacing: 2 }}>{serial}</div>
      </div>

      <div style={{ display: "flex", gap: 36, marginTop: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 220 }}>
          <div
            style={{
              display: "flex",
              width: 220,
              height: 220,
              overflow: "hidden",
              border: "2px solid rgba(255, 42, 109, 0.6)",
              background: C.void,
            }}
          >
            {avatar ? (
              // Satori needs a plain <img> with explicit dimensions; next/image has no meaning here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" width={216} height={216} style={{ objectFit: "cover" }} />
            ) : (
              <NoAvatar />
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 14,
              ...mono,
              fontSize: 16,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            <div style={{ color: C.yellow }}>{`LVL ${level}`}</div>
            <div style={{ color: C.mute }}>{rank}</div>
          </div>
          <div style={{ display: "flex", height: 8, marginTop: 8, background: C.line }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: C.yellow }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: 852 }}>
          <div style={label}>Handle</div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textShadow: "3px 0 rgba(255, 42, 109, 0.7), -3px 0 rgba(5, 217, 232, 0.7)",
            }}
          >
            {user.name}
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, color: C.pink }}>{role.name}</div>
          <div style={{ fontSize: 21, color: C.mute }}>{role.tagline}</div>

          <div style={{ display: "flex", gap: 44, marginTop: 24 }}>
            <Stat label="Anime" value={stats.animeCount} />
            <Stat label="Manga" value={stats.mangaCount} />
            <Stat label="Days" value={daysWatched(stats)} />
            <Stat label="Mean" value={stats.meanScore ?? "-"} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
        <div style={label}>Installed implants</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {stats.topGenres.length ? (
            stats.topGenres.map((g) => (
              <div
                key={g.genre}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "4px 12px",
                  border: "1px solid rgba(5, 217, 232, 0.4)",
                  background: "rgba(5, 217, 232, 0.05)",
                  ...mono,
                  fontSize: 17,
                  color: C.cyan,
                }}
              >
                <span>{g.genre}</span>
                <span style={{ color: C.mute }}>{`${Math.round(g.share * 100)}%`}</span>
              </div>
            ))
          ) : (
            <div style={{ ...mono, fontSize: 17, color: C.mute }}>none detected</div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: "auto",
          paddingTop: 18,
          borderTop: `1px solid ${C.line}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, ...label, fontSize: 15 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <span>Issued</span>
            <span style={{ color: C.ink }}>{issuedOn(syncedAt)}</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <span>Shelf</span>
            <span style={{ color: C.ink }}>{`${shelf.volumes} vol`}</span>
            <span>{`- ${shelf.series} series`}</span>
          </div>
        </div>
        <Barcode seed={serial} />
      </div>
    </div>
  );
}

function Stat({ label: name, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ ...label, fontSize: 13 }}>{name}</div>
      <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.2 }}>{String(value)}</div>
    </div>
  );
}

/** Stands in for the avatar when AniList has none (or it couldn't be fetched). */
function NoAvatar() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        width: "100%",
        height: "100%",
        background: `linear-gradient(160deg, rgba(157, 77, 255, 0.35), ${C.void} 70%)`,
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 700, color: "rgba(232, 232, 244, 0.25)", lineHeight: 1 }}>ID</div>
      <div style={{ ...mono, fontSize: 14, letterSpacing: 4, textTransform: "uppercase", color: C.pink }}>no signal</div>
    </div>
  );
}

/** The same bars as the on-page card, two pixels per unit. */
function Barcode({ seed }: { seed: string }) {
  const scale = 2;
  return (
    <div style={{ display: "flex", position: "relative", width: BARCODE_WIDTH * scale, height: 56, overflow: "hidden" }}>
      {barcodeBars(seed).map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x * scale,
            top: 0,
            width: b.w * scale,
            height: 56,
            background: "rgba(232, 232, 244, 0.8)",
          }}
        />
      ))}
    </div>
  );
}
