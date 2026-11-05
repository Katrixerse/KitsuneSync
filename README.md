# KitsuneSync 狐

A Next.js dashboard that syncs your [AniList](https://anilist.co) anime and manga lists, then adds what AniList lacks:

- **Physical manga shelf**: track which volumes you actually own, volume by volume, with gaps highlighted and editions (standard, omnibus, deluxe, box set) logged.
- **Auto-filling wishlist**: missing volumes, newly released volumes, highly rated manga you don't own yet, and your plan-to-read list, queued up automatically.
- **Release alerts**: when a sync finds that AniList lists more volumes for a series on your shelf than it did last time, the dashboard says which ones are out.
- **Cyberpunk ID card**: your stats as a Night City ID with a role, a level, genre "implants" and a scannable-looking barcode, downloadable as a PNG.
- **Cat mascot**: a visor-wearing cat reads your list and comments on your taste (generous scorer? contrarian? 40 gaps on your shelf?).

No login and no API token. It reads public AniList lists, and your shelf and wishlist are saved in PostgreSQL under an anonymous profile tied to your browser.

## Run it with Docker

```bash
docker compose up --build
```

Open http://localhost:3000, then enter an AniList username or press **Try demo** to load a sample profile with a partly filled shelf.

This starts PostgreSQL 18 (data in the `pgdata` volume) and the app. The schema is created on first start. To change the database password or ports, set `POSTGRES_PASSWORD`, `POSTGRES_PORT` or `APP_PORT` in a `.env` file next to `compose.yaml`.

`GET /api/health` answers `{ "ok": true }` while Postgres is reachable and `503` otherwise; the app container's healthcheck polls it, so `docker compose ps` shows the app as healthy only once it can serve data.

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
   └──── layout render ◀──── PostgreSQL  profiles · libraries · shelf_series · release_alerts
                                          wishlist_manual · wishlist_dismissed · link_codes
   lib/shelf.ts     volume ownership, gaps, ranges ("1–3, 5")
   lib/wishlist.ts  builds the wishlist from shelf + manga list
   lib/releases.ts  spots volumes AniList added since the last sync
   lib/profile.ts   stats, role, level, cat commentary
```

- **Sync**: `syncLibraryAction` in `src/app/actions.ts` calls `src/lib/anilist/client.ts`, which sends one GraphQL request that fetches both `MediaListCollection`s, then flattens them (skipping custom-list duplicates) into a small `Library` shape. Unknown users, private lists, rate limits and a stalled AniList (15 s timeout) come back as readable errors. The library is stored as one `jsonb` row per profile. Responses are cached per username for a minute (`src/lib/sync-cache.ts`) and a profile, or the client IP before a profile exists, may sync 10 times a minute (`src/lib/rate-limit.ts`); both limits live in the server process, which suits the single-container deploy.
- **Profiles**: there are no accounts. The first save creates a profile with a random id and stores it in an httpOnly cookie (`src/lib/session.ts`). To open the same profile on a phone or another browser, Settings → Link another device shows a one-time code (8 letters and digits, `src/lib/link-code.ts`) that is valid for 10 minutes; entering it in Settings on the other device points that browser's cookie at the profile. Redeeming is limited to 10 attempts a minute per profile or IP. Settings → Export/Import still moves a shelf as a JSON file.
- **Storage**: the root layout loads the profile from Postgres and seeds `src/lib/store.ts`, a small external store read through `useSyncExternalStore`, so pages render with your data straight away. Edits update the store immediately and are saved through Server Actions, which validate every input (`src/lib/validate.ts`): covers and links must point at AniList, colours must be hex, and a profile holds at most 2000 series, 500 hand-added wishes and 5000 hidden wishlist items. Imports and syncs write the shelf and wishlist in one batched statement per table. If a save fails, the store reloads what the server has and the nav shows an error. Re-syncing refreshes titles and covers on the shelf without touching owned volumes. Each series remembers AniList's volume count from the last sync (`releasedVolumes`): a total that still matches it follows AniList's count, while a total you typed yourself is kept. When the count has grown, the dashboard shows a **New releases** alert naming the volumes (`src/lib/releases.ts`); it stays until you dismiss it or take the series off the shelf, and later syncs add to it rather than replacing it. Series saved before this existed get their count on the next sync, without an alert.
- **Schema**: migrations live in `src/lib/db/migrate.ts` and run on server start from `src/instrumentation.ts`, guarded by an advisory lock. The same startup hook runs a cleanup (`src/lib/db/cleanup.ts`), repeated daily, that deletes profiles untouched for 400 days (the cookie's lifetime), empty profiles older than a day and expired link codes.
- **Wishlist rules** (`src/lib/wishlist.ts`), highest priority first:
  1. *Fill the gaps*: volumes missing below the highest volume you own.
  2. *Next volumes*: released volumes past the end of your shelf. For ongoing series with no known total, your AniList volume progress is used as the hint.
  3. *Added by you*: anything pinned by hand (art books, box sets, figures).
  4. *Start collecting*: manga you scored 8+ but have no copies of.
  5. *From your planning list*: vol. 1 of plan-to-read manga.

  Hidden items come back automatically when their missing volumes change.
- **ID card and mascot** (`src/lib/profile.ts`): the role comes from your top genre (Sci-Fi/Mecha → Netrunner, Psychological/Mystery → Fixer, and so on), the level from episodes and chapters, and the cat's lines from a weighted rule set. The picks are seeded by username, so they stay stable between visits. **Download PNG** fetches `/id-card.png`, which draws the same card as a 1200×630 image on the server with `next/og` (fonts are vendored under `src/app/id-card.png/fonts`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit tests (Vitest) for sync normalization, validation, shelf, wishlist and profile logic. Database tests run too when `DATABASE_URL` is set |
| `npm run test:e2e` | Playwright smoke tests (`e2e/`) of the demo flow, shelf and wishlist saves, backup export and reset, against a production build on port 3200. Run locally it builds first, needs `DATABASE_URL` and the Chromium from `npx playwright install chromium`; in CI it reuses the build from the step before |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates Next route types, then runs `tsc` |

CI runs lint, typecheck, tests (against a Postgres service), a build and the Playwright smoke tests against that build on pull requests and on pushes to `main`, and checks that the Docker image builds; a newer push cancels the run still going for the old commit, and a failed run keeps the Playwright report (with traces) as an artifact. Dependabot opens weekly PRs for npm (minor and patch bumps grouped into one), GitHub Actions and the Docker base image.

## Stack

Next.js 16 (App Router, standalone output) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 18 via `pg` · Docker Compose · Vitest · Playwright.

If you serve it over HTTPS behind a reverse proxy, make sure the proxy sends `X-Forwarded-Proto` so the profile cookie is marked `Secure`. Every response carries a Content-Security-Policy and the usual hardening headers (`next.config.ts`); if you add another image host, allow it in both `images.remotePatterns` and the CSP `img-src`.

## Roadmap

- [ ] AniList OAuth to read private lists and write progress back
- [x] Export the ID card as a PNG to share
- [ ] ISBN barcode scanning to add volumes from your phone camera
- [x] Link a profile across devices with a one-time code from Settings
- [x] Release alerts for series on your shelf

## Credits

List data and cover art come from [AniList](https://anilist.co) through its public GraphQL API. This project isn't affiliated with AniList.
