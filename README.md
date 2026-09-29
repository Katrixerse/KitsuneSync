# KitsuneSync 狐

A Next.js dashboard that syncs your [AniList](https://anilist.co) anime and manga lists, then adds what AniList lacks:

- **Physical manga shelf**: track which volumes you actually own, volume by volume, with gaps highlighted and editions (standard, omnibus, deluxe, box set) logged.
- **Auto-filling wishlist**: missing volumes, newly released volumes, highly rated manga you don't own yet, and your plan-to-read list, queued up automatically.
- **Cyberpunk ID card**: your stats as a Night City ID with a role, a level, genre "implants" and a scannable-looking barcode.
- **Cat mascot**: a visor-wearing cat reads your list and comments on your taste (generous scorer? contrarian? 40 gaps on your shelf?).

No login and no API token. It reads public AniList lists, and your shelf and wishlist are saved in PostgreSQL under an anonymous profile tied to your browser.

## Run it with Docker

```bash
docker compose up --build
```

Open http://localhost:3000, then enter an AniList username or press **Try demo** to load a sample profile with a partly filled shelf.

This starts PostgreSQL 18 (data in the `pgdata` volume) and the app. The schema is created on first start. To change the database password or ports, set `POSTGRES_PASSWORD`, `POSTGRES_PORT` or `APP_PORT` in a `.env` file next to `compose.yaml`.

## Develop

```bash
docker compose up -d db          # just the database, on localhost:5432
cp .env.example .env.local       # DATABASE_URL for the dev server
npm install
npm run dev
```

## How it works

```
Browser ──Server Actions──▶ Next.js server ──GraphQL──▶ graphql.anilist.co
   ▲  (optimistic store)          │
   │                              ▼
   └──── layout render ◀──── PostgreSQL  profiles · libraries · shelf_series
                                          wishlist_manual · wishlist_dismissed
   lib/shelf.ts     volume ownership, gaps, ranges ("1–3, 5")
   lib/wishlist.ts  builds the wishlist from shelf + manga list
   lib/profile.ts   stats, role, level, cat commentary
```

- **Sync**: `syncLibraryAction` in `src/app/actions.ts` calls `src/lib/anilist/client.ts`, which sends one GraphQL request that fetches both `MediaListCollection`s, then flattens them (skipping custom-list duplicates) into a small `Library` shape. Unknown users, private lists and rate limits come back as readable errors. The library is stored as one `jsonb` row per profile.
- **Profiles**: there are no accounts. The first save creates a profile with a random id and stores it in an httpOnly cookie (`src/lib/session.ts`). Use Settings → Export/Import to move a shelf to another browser.
- **Storage**: the root layout loads the profile from Postgres and seeds `src/lib/store.ts`, a small external store read through `useSyncExternalStore`, so pages render with your data straight away. Edits update the store immediately and are saved through Server Actions, which validate every input (`src/lib/validate.ts`). If a save fails, the store reloads what the server has and the nav shows an error. Re-syncing refreshes titles, covers and totals on the shelf without touching owned volumes.
- **Schema**: migrations live in `src/lib/db/migrate.ts` and run on server start from `src/instrumentation.ts`, guarded by an advisory lock.
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
| `npm test` | Unit tests (Vitest) for sync normalization, validation, shelf, wishlist and profile logic. Database tests run too when `DATABASE_URL` is set |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates Next route types, then runs `tsc` |

CI runs lint, typecheck, tests (against a Postgres service) and a build on every push and pull request, and checks that the Docker image builds.

## Stack

Next.js 16 (App Router, standalone output) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 18 via `pg` · Docker Compose · Vitest.

If you serve it over HTTPS behind a reverse proxy, make sure the proxy sends `X-Forwarded-Proto` so the profile cookie is marked `Secure`.

## Roadmap

- [ ] AniList OAuth to read private lists and write progress back
- [ ] Export the ID card as a PNG to share
- [ ] ISBN barcode scanning to add volumes from your phone camera
- [ ] Link a profile across devices (currently JSON export/import in Settings)
- [ ] Release alerts for series on your shelf

## Credits

List data and cover art come from [AniList](https://anilist.co) through its public GraphQL API. This project isn't affiliated with AniList.
