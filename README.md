# KitsuneSync 狐

A Next.js dashboard that syncs your [AniList](https://anilist.co) anime and manga lists, then adds what AniList lacks:

- **Physical manga shelf**: track which volumes you actually own, volume by volume, with gaps highlighted and editions (standard, omnibus, deluxe, box set) logged.
- **Auto-filling wishlist**: missing volumes, newly released volumes, highly rated manga you don't own yet, and your plan-to-read list, queued up automatically.
- **Cyberpunk ID card**: your stats as a Night City ID with a role, a level, genre "implants" and a scannable-looking barcode.
- **Cat mascot**: a visor-wearing cat reads your list and comments on your taste (generous scorer? contrarian? 40 gaps on your shelf?).

No login and no API token. It reads public AniList lists, and your shelf and wishlist stay in your browser.

## Try it

```bash
npm install
npm run dev
```

Open http://localhost:3000, then enter an AniList username or press **Try demo** to load a sample profile with a partly filled shelf.

## How it works

```
Browser ──GET /api/anilist?user=name──▶ Route handler ──GraphQL──▶ graphql.anilist.co
   │                                         (normalizes, maps errors)
   ▼
localStorage  { library, shelf, wishlist }
   │
   ├─ lib/shelf.ts     volume ownership, gaps, ranges ("1–3, 5")
   ├─ lib/wishlist.ts  builds the wishlist from shelf + manga list
   └─ lib/profile.ts   stats, role, level, cat commentary
```

- **Sync**: `src/app/api/anilist/route.ts` sends one GraphQL request that fetches both `MediaListCollection`s, then flattens them (skipping custom-list duplicates) into a small `Library` shape. Unknown users, private lists and rate limits come back as readable errors.
- **Storage**: `src/lib/store.ts` is a tiny external store on top of `localStorage`, read through `useSyncExternalStore`, so the server render and hydration stay consistent and tabs stay in sync. Re-syncing refreshes titles, covers and totals on the shelf without touching owned volumes.
- **Wishlist rules** (`src/lib/wishlist.ts`), highest priority first:
  1. *Fill the gaps*: volumes missing below the highest volume you own.
  2. *Next volumes*: released volumes past the end of your shelf. For ongoing series with no known total, your AniList volume progress is used as the hint.
  3. *Added by you*: anything pinned by hand (art books, box sets, figures).
  4. *Start collecting*: manga you scored 8+ but have no copies of.
  5. *From your planning list*: vol. 1 of plan-to-read manga.

  Hidden items come back automatically when their missing volumes change.
- **ID card and mascot** (`src/lib/profile.ts`): the role comes from your top genre (Sci-Fi/Mecha → Netrunner, Psychological/Mystery → Fixer, and so on), the level from episodes and chapters, and the cat's lines from a weighted rule set. The picks are seeded by username, so they stay stable between visits.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit tests (Vitest) for sync normalization, shelf, wishlist and profile logic |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates Next route types, then runs `tsc` |

CI runs lint, typecheck, tests and a build on every push and pull request.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Vitest. No database: deploy anywhere that runs Next.js (Vercel works with zero config).

## Roadmap

- [ ] AniList OAuth to read private lists and write progress back
- [ ] Export the ID card as a PNG to share
- [ ] ISBN barcode scanning to add volumes from your phone camera
- [ ] Optional cloud sync for the shelf (currently JSON export/import in Settings)
- [ ] Release alerts for series on your shelf

## Credits

List data and cover art come from [AniList](https://anilist.co) through its public GraphQL API. This project isn't affiliated with AniList.
