# Performance and caching

What the site caches, where, for how long, and how it goes stale; what it deliberately doesn't cache; and how to measure it. The numbers come from the November 2026 performance pass (branch `perf/settings-caching-optimization`). The raw results are in `docs/perf/*.json`.

## How to measure

`web/scripts/perf-measure.mjs` is a development-only tool. It builds the app into `.next-perf` (with `--build`), starts `next start` on localhost against the local database, and signs in as a throwaway GitHub-style user it creates for the run: a session, profile, links, a 120 KB picture, an email and a leaderboard entry. It deletes that user afterwards. Then it times each route and counts the database queries each request makes.

```
pnpm db                                    # local database, migrated and seeded
cd web
node scripts/perf-measure.mjs --build --latency 5 --browser --label "my run" --out ../docs/perf/my-run.json
```

- `--latency MS` adds a fixed delay before every query, standing in for the network between Vercel and Supabase. The local database answers in well under a millisecond, which hides round trips.
- `--pool N` sets the pool size. The default is 3, production's size on Vercel (`VERCEL_POOL_MAX`).
- `--browser` adds Chromium measurements:
  - a cold load of `/settings`, five fresh contexts: TTFB, time until the page and the theme list show, JavaScript transferred and decoded, scripting time, and how many `/api/me` requests it makes;
  - the theme picker at 4× CPU slowdown: choosing a theme, and a search keystroke;
  - repeat navigation from Profile to Settings through the account menu.

The server side is `web/lib/server/perf-trace.ts`. When `PERF_TRACE_FILE` is set, and never on Vercel, each query and session lookup appends one JSON line: the kind, the duration, and the first 90 characters of the SQL, never its parameters. Requests run one at a time, so every line written during a request belongs to it.

## Results

Environment: a MacBook (Apple silicon, Node 26), production build on 127.0.0.1, local embedded Postgres, pool of 3, 5 ms added per query, 20 requests per route after 3 warm-up requests.

- **Before:** commit `290d95c` (main plus the measurement tool only).
- **After:** this branch.

The two builds were measured alternately, twice (before, after, after, before), and both rounds are shown. Other work kept the machine's load average between about 3 and 13, so differences of a few milliseconds are noise.

### Server

| Route (signed in unless noted) | TTFB before → after (ms) | Total before → after (ms) | Queries | Session lookup (ms) |
|---|---|---|---|---|
| `/settings` | 45, 50 → 5.3, 5.3 | 48, 53 → 18, 19 | 8 → 2 | 23, 25 → 8, 8 |
| `GET /api/me` | 36, 36 → 22, 24 | 36, 37 → 23, 25 | 5 → 2 | 24, 24 → 10, 10 |
| `/puzzles/hono-trace-002` | 39, 40 → 24, 23 | 41, 42 → 25, 25 | 4 → 2 | 21, 23 → 9, 9 |
| `/puzzles` | 4.0, 4.7 → 3.2, 3.6 | 83, 86 → 56, 64 | 12 → 8 | 20, 21 → 7, 8 |
| `/puzzles`, signed out | 3.5, 3.6 → 3.1, 3.2 | 44, 47 → 36, 38 | 7 → 4 | none |
| `GET /api/puzzles` | 38, 41 → 19, 21 | 39, 42 → 20, 21 | 6 → 2 | 23, 25 → 9, 9 |
| `/leaderboard` | 73, 81 → 10, 12 | 75, 84 → 49, 53 | 11 → 5 | 25, 27 → 11, 12 |
| `GET /api/leaderboard` | 69, 71 → 47, 51 | 69, 72 → 47, 52 | 11 → 5 | 25, 25 → 10, 11 |
| `/profile` | 5.2, 5.4 → 4.9, 5.0 | 73, 77 → 58, 62 | 18 → 16 | 20, 22 → 8, 9 |

`/settings` and `/leaderboard` now stream. Their TTFB is the time to the first streamed byte, and "total" is when the last byte arrives. With no added latency (`final-*-0ms.json`), each query is well under a millisecond and the timing differences are within noise. Only the query counts differ.

### Browser (cold load of `/settings`, median of five runs)

| Metric | Before (rounds 1, 2) | After (rounds 1, 2) |
|---|---|---|
| TTFB | 36, 40 ms | 5.4, 5.5 ms |
| Page header visible | 95, 99 ms | 69, 75 ms |
| Theme list visible | 181, 187 ms | 151, 156 ms |
| DOMContentLoaded | 75, 80 ms | 25, 40 ms |
| Choosing a theme, 4× CPU slowdown | 12.4, 12.7 ms | 9.2, 8.9 ms |
| Search keystroke, 4× CPU slowdown | 14.1, 14.0 ms | 12.9, 12.3 ms |
| Repeat navigation Profile → Settings | 109, 105 ms | 65, 60 ms |
| JavaScript decoded on `/settings` | 847 KB | 849 KB (the picker needs the theme catalog) |
| `/api/me` requests on a cold load | 1 | 1 |

### Other pages, signed out (one run each)

| Measure | Before | After |
|---|---|---|
| JavaScript decoded on `/puzzles`, `/leaderboard`, `/challenges`, `/profile` | 782–839 KB | 487–494 KB |
| `/puzzles` open and scrolled twice: prefetch requests | 97 | 18 |
| `/puzzles` open and scrolled twice: database queries | 66 | 8 |

The "before" build in this last table is from the middle of the pass, before the catalog cache, so its 66 includes the page's own 7 queries. Almost all the rest came from prefetching puzzle pages.

Not measured:
- Production signed in. Only public, signed-out production timings exist (`docs/perf/baseline-production-public.txt`).
- Anything after deployment. This branch isn't deployed.

## What is cached

| Data | Where | Lifetime | How it goes stale, and how it's cleared |
|---|---|---|---|
| Published puzzle catalog: puzzles, repos, tags | Each server instance's memory (`memoCache` in `lib/server/puzzles.ts`) | 5 minutes in production; 5 seconds elsewhere (`PUZZLE_CATALOG_TTL_MS`) | Content changes only through `ingest seed`. A newly published puzzle appears within the lifetime, or at once after a deployment. Detail, submit and hints check `published` live, so an unpublished puzzle can't be opened while an old copy still lists it. Concurrent requests share one load, and failures aren't kept. `clearPuzzleCatalog()` empties it in-process. |
| The user's status in the list | Not cached | | Read per request from that user's own `progress` rows and joined onto the catalog. |
| Code intelligence (`/api/snapshots/:id/symbols`, `/symbols/outline`, `/search`) | Browser and CDN (HTTP) | `public, max-age=60, s-maxage=600, stale-while-revalidate=600`, plus an ETag | A snapshot's SHA never changes, but a rebuild can change its index. Once stale, a client revalidates and gets a 304 if nothing changed. Errors and 429s are `no-store`. A CDN hit isn't counted against the per-client search limit. |
| Own picture (`/api/me/avatar?v=`) | Browser, `private` | Immutable per version | A new upload has a new version and URL. Revalidation with a matching `If-None-Match` is a 304 from the version alone, without reading the bytes. |
| Users row in step with GitHub login | Each server instance's memory (`lib/server/auth.ts`) | 5 minutes per user and login | Holds only an id and a login. It is consulted only after Better Auth has validated the session on that request, so it never decides who is signed in. A different login always upserts again. A row renamed by hand to resolve a login collision takes up to 5 minutes to be noticed. |
| Session lookup within one server render | React `cache()` | One request | Never shared between requests or people. |
| Who's signed in, in the browser (`MeResponse`) | `AuthProvider`'s memory (`lib/client/me-loader.ts`) | The page's lifetime | Answers are applied in the order they started. A sign-in, sign-out or deletion wins over anything that started before it. A confirmed save (name, picture, email) updates the header in place, but only for the account that made it, and never during a sign-in or sign-out. Nothing is written to storage. |
| Learn course content | The page server's own bundle (`lib/learn/course.generated.ts`) | Until the next deploy | Content ships with the code, so a change needs a deploy. `/learn` is static; a lesson page renders per request only so its practice links follow the cached puzzle catalog, and needs no query while that catalog is fresh. The browser gets one lesson's public data, never the course or the keys. |
| Learn progress (client) | Memory for a signed-in user, `localStorage` (`cb-learn-progress`) for a guest | The page's lifetime, or until cleared | Loaded once per signed-in person from `GET /api/me/learn` (`no-store`), updated from each check's response, and dropped when the person changes. |
| Theme catalog (client) | One shared dynamic import | The page's lifetime | Loaded only to preview or apply a non-default theme, or when the picker opens or the Theme button is hovered or focused. A failed fetch isn't kept. |
| Applied theme for first paint | `localStorage` (`cb-applied`), tagged with its owner | Until it changes | Unchanged by this pass. The default theme needs no entry. |

## What is deliberately not cached

- **`/api/learn/*` and `/api/me/learn`.** Checks, hints and reveals are `no-store`; a guest's check touches no database, and a signed-in check writes only after a correct required answer.
- **Anything under `/api/me`, and every signed-in page.** These are `no-store` and rendered per request. Settings data isn't kept on the client either: the server renders it, and each form keeps its own edits.
- **The leaderboard.** Leaving it "removes your entry and public name". A shared rankings cache would keep a departed person's name visible on other instances. Instead, the page, the count and the viewer's own standing are one statement that ranks once, where there used to be five queries that ranked three times.
- **Challenges.** Each period's puzzle is chosen and stored once, and completions are decided on the database's clock.
- **Better Auth's cookie cache.** It would skip the session lookup, but a signed-out session or a deleted account would keep working until the cookie expired.
- **Next's router cache for dynamic pages (`staleTimes.dynamic`).** It's site-wide, so it would show old progress on the puzzle list after a solve.
- **A client data library (TanStack Query, SWR).** Settings would have to be fetched in the browser, which undoes the streaming.
- **Cache Components (`cacheComponents`, `"use cache"`).** Turning it on changes how every page renders. The in-memory catalog cache is simpler, and unlike `unstable_cache` it clears on deploy.

## Prefetching

Next prefetches a dynamic route up to its nearest `loading.tsx` when a link scrolls into view. Settings, the leaderboard, profile, challenges and the puzzle pages have loading screens, so navigating to them shows one at once.

The puzzle table's links, its tag chips and the profile history use `IntentLink`, which prefetches only on hover, focus or touch. A puzzle page's layout looks up the session and the puzzle, so prefetching every visible row cost a database round trip per link. The header and account-menu links keep Next's default. Their prefetch renders only the loading shell, with no private data.

Monaco and Mermaid load only on puzzle pages.

## Database connections

Production uses at most 3 connections per Vercel instance, with a 5-second idle timeout and `attachDatabasePool` (see the DEVLOG entry on connection exhaustion). That part is unchanged.

What changed is how many queries a request runs at once. Settings used to issue five queries together, so two of them waited for a free connection; it now issues one. The session lookup is one query instead of three: Better Auth's two lookups are joined, and the users-row upsert usually doesn't run.
