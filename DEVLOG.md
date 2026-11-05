# DEVLOG

## Legal pages approved (launch checklist M7)

Type: Change

Goal: Publish the privacy policy and terms as final, with a real address people can write to about their data.

What should be done: Record the review in `web/lib/legal.ts`, and make the legal page test follow that file, not assume the pages are drafts.

What was done (technical):

- `web/lib/legal.ts`: `REVIEWED` is now `true`, which removes the "Draft" notice from `/privacy` and `/terms`. `CONTACT` is set, so both pages end with it as a `mailto:` link in place of the "will be listed here" placeholder. `LAST_UPDATED` stays 2026-11-05.
- `web/e2e/account.spec.ts` imports `LEGAL`. It checks that the draft notice shows only while `REVIEWED` is false, and that the contact shows as a `mailto:` link when `CONTACT` is set (the placeholder otherwise). It keeps passing whichever way the file is set.
- `spec.md` section 14 marks M7 done; sections 10 and the C6 row say the pages are approved.

## Code viewer could show a blank file

Type: Fix

Goal: A file always shows its content in the editor. Now and then a file opened blank: the right tab and outline, but an empty editor. It showed up as two intermittent e2e failures, one in CI.

What should be done: Find why the editor sometimes had an empty model, and make it impossible.

What was done (technical):

- Cause: `CodeViewer`'s `ModelStore` disposed every model its loads produced, including loads still in flight when it was disposed. Its `fetchModel` ended with `getModel(uri) ?? createModel(...)`. When the viewer's effect ran twice (React strict mode in `next dev`, or any change to its inputs), the discarded store's fetch could finish after the new store had created the model. It then adopted that model and disposed it while the editor showed it, and `@monaco-editor/react` replaced it with a blank model for the same path.
- Fix: a disposed store never creates or adopts a model, and a store disposes only models it created itself. If a model for the URI already exists, it gets the fetched text when its content differs, so a blank model made elsewhere can't stick.
- Regression test in `web/e2e/viewer.spec.ts` delays the first README request so the discarded load finishes last. Without the fix it fails (blank editor); with it, it passed 3 runs out of 3.
- The new account-deletion e2e test now uses the `visible()` helper, because a test ID read right after navigating can match React's hidden copy of the streamed HTML too.

## Hosted migration runner (launch checklist C7)

Type: Addition

Goal: Apply database migrations to hosted Supabase the same way every time, once each, in order, instead of pasting SQL into an editor and remembering which files went in.

What should be done: A command that applies `supabase/migrations` to `SUPABASE_DB_URL` with a tracking table, like `scripts/localdb.mjs migrate` does locally.

What was done (technical):

- `uv run --env-file .env python -m ingest migrate [--dry-run]`, in `ingest/src/ingest/migrate.py`. It only runs with `SUPABASE_DB_URL` set explicitly, so it can't fall back to the local database.
- Each file runs in its own transaction and is recorded with its SHA-256 in `migrations.applied`. That's a separate schema with every privilege revoked, so hosted Supabase's API can't expose it the way it would a new table in `public`.
- It stops with a clear message if an applied file has changed (CLAUDE.md: never edit an applied migration), if a file would apply out of order, if the database has a migration this checkout doesn't, if the database has no `anon` and `authenticated` roles, or if it's a `pnpm db` database, which `localdb.mjs` already tracks in `public.schema_migrations`. A Postgres advisory lock stops two runs from overlapping.
- 16 tests in `ingest/tests/test_migrate.py` (the no-roles check skips on a server whose other databases already created those roles, since roles are server-wide): planning with no database, plus throwaway databases on `INGEST_TEST_DB_URL` covering a fresh apply, a rerun, a failing file rolling back, an edited file, a dry run, and clients' lack of access to the tracking table.

## Shared rate limiting in Postgres (launch checklist C3)

Type: Change

Goal: Rate limits that hold on Vercel, where many serverless instances each kept their own in-memory counts, so the real limit was the configured one times the number of instances.

What should be done: Keep submit and search limits in Postgres, with a table that follows the RLS rule, and point Better Auth's limiter at the same store.

What was done (technical):

- Migration 0006 adds `rate_limits (key, count, window_start)` with row-level security on, client privileges revoked, and an index on `window_start` for pruning.
- `web/lib/server/rate-limit.ts` counts each request with one `INSERT ... ON CONFLICT DO UPDATE` that also resets an expired window. That makes it atomic: a test fires 25 requests at once against a limit of 5 and exactly 5 get through. Time comes from the database's `now()`, so instances never disagree about the clock. About one request in a hundred also deletes windows older than an hour. Keys are cut to 200 characters.
- `isRateLimited` is now async; the submit and search routes await it.
- Better Auth's limiter uses the same table under an `auth:` prefix, through `rateLimit.customStorage.consume`. Better Auth turns its limiter on in production only.
- Migration 0006 was applied to the local `pnpm db` database with `node scripts/localdb.mjs migrate`.

## Snapshot upload to R2 (launch checklist C2)

Type: Addition

Goal: Put each snapshot's code where the browser will fetch it in production, so the site doesn't depend on the localhost `/snapshots` route.

What should be done: `upload <slug>` and `upload-all` put `manifest.json` and `files/...` at `snapshots/<slug>@<sha>/`, with content types, skipping unchanged files and never deleting. Credentials only from `ingest/.env`.

What was done (technical):

- `ingest/src/ingest/upload.py`, run as `uv run --env-file .env python -m ingest upload <slug>` or `upload-all`, each with `--dry-run`. It uses `boto3` against R2's S3 API (`https://<account>.r2.cloudflarestorage.com`, region `auto`). `boto3` is a new dependency, and `boto3-stubs[s3]` keeps strict pyright clean.
- Only the manifest and `files/` go up, with the same `Content-Type` and `Cache-Control: public, no-cache` the local route sends. Every put sends `Content-MD5`, so R2 rejects a corrupted upload.
- It lists what's already under the prefix once and skips any file whose MD5 matches R2's ETag. Files upload 16 at a time, and the manifest goes last, only after every file succeeded. Nothing is deleted. Symlinks are refused.
- Errors name the missing variables or R2's error code, never a credential value.
- 14 tests in `ingest/tests/test_upload.py`: a fake store for paths, content types, ordering, skipping, failure, dry run and no deletes, and botocore's `Stubber` for the real S3 adapter's pagination and put parameters. A real upload needs the bucket (M5).

## Search and sharing metadata (launch checklist C5)

Type: Addition

Goal: Let search engines find the puzzles, and show a proper preview card when someone shares a link.

What should be done: `robots.txt`, a sitemap of `/`, `/puzzles` and the puzzle pages, and a social preview image.

What was done (technical):

- `web/app/robots.ts` allows everything except `/api/`, `/profile` and `/snapshots/`, and names the sitemap.
- `web/app/sitemap.ts` lists `/`, `/puzzles`, `/privacy`, `/terms` and every published puzzle, dated by its snapshot's `indexed_at`. It's rendered on request, so a new puzzle shows up without a rebuild and the build doesn't need the database.
- `web/app/opengraph-image.tsx` draws a 1200×630 PNG with the wordmark and tagline at build time. The root layout sets `metadataBase`, Open Graph and `twitter:card` so link previews get an absolute image URL.
- Absolute URLs come from `siteOrigin()` in `web/lib/server/site.ts`, which is `BETTER_AUTH_URL`'s origin, already required in production. So a production build now needs `BETTER_AUTH_URL` set, as Vercel will.
- Tests: `web/tests/seo.test.ts` (origin rules, robots, sitemap against the fixture database including unpublished puzzles) and `web/e2e/seo.spec.ts` (the real routes, the PNG's size, the meta tags).

## Privacy policy, terms and account deletion (launch checklist C6)

Type: Addition

Goal: Let people see what the site keeps about them and delete their account themselves, which a public launch needs.

What should be done: Static privacy and terms pages linked from the footer, and a way for a user to delete their account.

What was done (technical):

- `DELETE /api/me` in `web/app/api/me/route.ts` needs a signed-in user, the body `{ "confirm": true }`, and an `Origin` header matching the site (`isSameOriginRequest` in `web/lib/server/http.ts`), so another site can't trigger it. `deleteAccount` in `web/lib/server/account.ts` deletes the `auth_users` row in a transaction. That cascades to sessions, the linked GitHub account and its token, the `users` row, submissions and progress. It also deletes the user's `rate_limits` rows. The response clears Better Auth's cookies, by the names Better Auth reports, and the dev-login cookie. Better Auth's own `/delete-user` stays disabled.
- The profile page has a "Delete account" section. The first click shows what will be lost, and only the second deletes. A new `btn-danger` style marks that button.
- `/privacy` and `/terms` are static pages written from what the code actually stores: GitHub username, ID, name and avatar URL; the encrypted token; session IP and browser; submissions; no email, no analytics, no tracking cookies. They're linked from the landing page footer and the profile page. Until M7, `web/lib/legal.ts` has `REVIEWED: false`, which shows a draft notice, and `CONTACT: null`, which says a contact address will be added.
- Tests: `web/tests/account.test.ts` checks that every table is emptied for a dev user and for a GitHub user with a linked account, that other users are left alone, the cookie clearing, the 403 for a foreign or missing Origin, the 400 without confirmation, and the 401 when signed out. `web/e2e/account.spec.ts` deletes through the real UI and checks the legal pages and footer links.

## Production smoke test (launch checklist C9)

Type: Addition

Goal: Catch what only breaks in a production build before Vercel does: the stricter CSP with no eval, static pages, the dev login being off, and code coming from the CDN.

What should be done: Playwright against `next build && next start`, checking the landing page, the puzzle list, a puzzle page with code from the CDN, and that `/api/dev/*` is 404.

What was done (technical):

- `pnpm smoke` runs `scripts/smoke.mjs`. It starts a throwaway Postgres with the fixture, and a small HTTP server on another port that serves the fixture snapshot the way R2 will (CORS, content types, `snapshots/<name>/...` paths only). It builds the app with `NEXT_PUBLIC_SNAPSHOT_CDN_URL` pointing there and the `/snapshots` route off, then runs `web/smoke/smoke.spec.ts` with `web/playwright.smoke.config.ts`.
- The 7 checks: landing page up, with production's CSP (no `unsafe-eval`, the CDN in `connect-src`); the puzzle list; a puzzle page whose manifest and file requests all go to the CDN, with no CSP violations or page errors; the app's own `/snapshots` route returning 404; `/api/dev/login` and `/api/dev/logout` returning 404; robots and sitemap on the site's origin; and the legal pages.
- The temporary-database code `scripts/e2e.mjs` had is now shared with the smoke runner in `scripts/test-env.mjs`. `.next-smoke` is gitignored, listed in `web/tsconfig.json` so builds don't rewrite that file, and skipped by the R2-credential scan.

## CI on GitHub Actions (launch checklist C1)

Type: Addition

Goal: Run every check on every pull request and every push to `main`, so a broken change shows up before it merges, and so `main` can be protected (M8).

What should be done: Web lint, typecheck and tests against a Postgres service, ingest tests, ruff, pyright, `pnpm validate` with the snapshots, and `pnpm e2e`.

What was done (technical):

- `.github/workflows/ci.yml` has five jobs on Ubuntu, with no secrets: web (lint, typecheck, vitest against a `postgres:17` service through `TEST_DATABASE_URL`); ingest (`uv sync --locked`, ruff check and format, pyright, pytest with `INGEST_TEST_DB_URL`); validate; e2e; and smoke.
- The validate job restores `ingest/out` from a cache keyed on `content/repos.yaml`, `ingest/src/**` and `ingest/uv.lock`. On a miss it installs the pinned scip-typescript 0.6.0 and scip-python 0.6.8 and runs `snapshot-all`.
- The e2e and smoke jobs install Chromium with its Linux libraries, and upload `web/test-results/` when they fail. On the first run, the e2e job's install hung for 30 minutes in `apt-get update` on GitHub's Azure Ubuntu mirror and was cancelled, while the same step passed in the smoke job. So each install attempt now has a 5-minute limit and up to three tries.
- The first run on `main` also showed that the whole pipeline works on Linux: building all 21 snapshots with the pinned indexers, validation, ingest and web tests, and the production smoke test all passed there.
- Runs on the same branch cancel each other, and the workflow can only read the repository.

## Security headers (launch checklist C4)

Type: Addition, Fix

Goal: Every page and API response tells the browser to refuse scripts from other hosts, refuse to be framed, use HTTPS only, and not guess content types, so an injected script or a clickjacking page has much less to work with.

What should be done: Send a Content Security Policy, HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors` from `next.config.ts`, without breaking Monaco, its worker, mermaid, or fetching snapshots from the CDN. The whole e2e suite has to pass with them on.

What was done (technical):

- `web/lib/security-headers.ts` builds the headers and `web/next.config.ts` sends them on every path, including API routes and `/snapshots`. The config is now a function of the Next.js phase, so `next dev` gets `'unsafe-eval'`, which React needs there, and a production build doesn't. `X-Powered-By` is off.
- The CSP is `default-src 'self'`, with `connect-src` adding only the origin of `NEXT_PUBLIC_SNAPSHOT_CDN_URL`. A value that isn't an http or https URL stops the build instead of quietly producing a policy that blocks every snapshot. `worker-src 'self'` covers Monaco's bundled worker. `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, and in production `upgrade-insecure-requests`.
- `script-src` keeps `'unsafe-inline'`. Next.js streams page data in inline scripts, and a header from `next.config.ts` can't carry a per-request nonce. A nonce would need the CSP set in `proxy.ts` and every page rendered dynamically, the static landing page included. That's a possible follow-up, written down in `spec.md` section 8. `style-src` keeps `'unsafe-inline'` for Monaco's injected styles, mermaid's `<style>` inside each SVG, and React `style` attributes.
- HSTS is two years with `includeSubDomains`, without `preload`, since getting onto the preload list is hard to undo. `X-Frame-Options: DENY` is there for browsers too old for `frame-ancestors`.
- Tests: `web/tests/security-headers.test.ts` checks each directive, dev against production, the CDN origin, and a bad CDN URL. `web/e2e/security-headers.spec.ts` checks the headers on pages, an API route and a snapshot file. It fails on any CSP violation while loading the landing page and puzzle list, opening files in Monaco, and signing in, submitting and opening a solution with mermaid diagrams. It also checks that another page can't frame the site.
- Fix to the e2e runner: `scripts/e2e.mjs` now sets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to empty. A developer's `web/.env.local` with a GitHub OAuth app was turning GitHub sign-in on for the e2e server, which failed three tests that expect it off: the landing page's "Log in" note, the header's sign-in control, and the phone layout, where the extra button made the header 69px too wide.
- `spec.md` section 8 has a new "Security headers" part, and C4 is marked done in section 14.

## Launch checklist written down

Type: Addition

Goal: Let teammates see what's left before a public launch, pick up work without asking, and know which steps a person has to do by hand.

What should be done: Write every remaining launch task in one place, with the steps for the manual ones, and make sure a Claude session tells the user about manual steps instead of trying them.

What was done (technical):

- `spec.md` section 14 is the launch checklist. It has a critical path, then two numbered lists. The numbers are meant to be used in PR titles and DEVLOG entries.
- **Manual items, M1 to M9,** each with exact steps: the domain; the Supabase database (migrations, which connection string goes where, and seeding); the production GitHub OAuth app; the Vercel project and its environment variables; the R2 bucket with CORS and a write-only token; human blind second solves with the `blind-export` and `blind-check` commands; the legal review; protecting `main`; and an error-monitoring account.
- **Per-developer setup:** each teammate makes their own local GitHub OAuth app and `web/.env.local`. The section also says where secrets live and what to do if one leaks.
- **Code items, C1 to C9,** each with a "done when": CI, snapshot upload to R2, shared rate limiting, security headers, search and sharing metadata, legal pages and account deletion, a hosted migration runner, error monitoring, and a production smoke test.
- The known open issues are listed there too, with details in the earlier DEVLOG entries.
- `CLAUDE.md` now points at section 14. When a task depends on a manual item, Claude should give the user that item's steps and stop, rather than work around it.

Still open: everything in section 14. Nothing on the checklist has been started.

## GitHub sign-in with Better Auth

Type: Addition, Change

Goal: Real accounts, so "Log in" works and progress belongs to a GitHub user instead of a localhost-only dev name.

What should be done: Use Better Auth instead of the Supabase Auth the spec planned, with GitHub as the only sign-in. Keep submissions and progress pointing at `users`, keep the dev login for localhost and the e2e tests, and keep every table locked away from clients.

What was done (technical):

- **Server.** `web/lib/server/better-auth.ts` builds Better Auth 1.7.16 on first use, through the app's own `pg` pool. `app/api/auth/[...all]/route.ts` mounts its routes.
  - Table and column names are snake_case: `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`.
  - Ids are UUIDs made by Postgres, so `users.id` can reference `auth_users.id`.
  - Telemetry is off.
- **Migration 0005** creates the four tables. Better Auth's own schema generator produced them from these options, and a test writes through Better Auth's adapter to prove they still match.
  - Existing users (dev logins) get an `auth_users` row with the same id, so no progress is lost.
  - `users.id` now references `auth_users` instead of Supabase's `auth.users`.
  - The new tables have row-level security and no client grants, which `rls.test.ts` checks for every table.
- **Who's signed in.** `getCurrentUser` reads a Better Auth session first, then falls back to the dev login where that's allowed. The first request after a GitHub sign-up creates the `users` row with the GitHub login, and a rename on GitHub updates it on the next sign-in.
  - If a login freed by a rename is already held by another user, the new account stays signed out rather than taking over that progress.
  - `/api/me` now says how the user signed in (`via`) and whether GitHub sign-in is configured.
- **UI.**
  - On the landing page, "Log in" starts GitHub sign-in and comes back to `/puzzles`. On a server with no GitHub OAuth app it says so.
  - The header and the sign-in prompt offer "Sign in with GitHub" when it's configured, plus the dev sign-in on localhost.
  - Sign-out ends whichever session is active, and on localhost clears a leftover dev cookie too.
- **Hardening**, mostly from a security review that ran a real sign-in through the callback with GitHub's API faked:
  - The GitHub login was being dropped. Marking the field `input: false` made Better Auth discard it from the profile mapping, so nobody could actually sign in. The field is now writable, and `/update-user`, the only route that could set it from a request, is disabled.
  - Account linking by email is off, and the stored email is made from GitHub's numeric id, not the GitHub email. Before, a second GitHub account that verified the same email would have joined the first user.
  - The GitHub access token reached the browser through `/get-access-token`. Tokens are now encrypted at rest, and the token, account-listing, linking and email-change routes are disabled.
  - Better Auth turns its origin and CSRF checks off when `NODE_ENV` is `test`, so the tests proved nothing. They're now forced on.
  - Production requires `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.
  - In dev without a URL, the trusted origin is the request's own Host, and only when it's a loopback address. Next reports `request.url` as `localhost` even on `127.0.0.1`, which broke sign-in on `127.0.0.1` until this change.
  - Better Auth keeps a failed schema check for the life of its instance. A server that started before migration 0005 stayed broken until restarted, so a schema mismatch now drops the instance and the next request builds a new one.
- **Tests.** `web/tests/github-auth.test.ts` has 26 tests:
  - the whole sign-in through the real start and callback routes, including private emails, renames, and two accounts sharing an email;
  - forged, unsigned and expired cookies;
  - cross-site sign-out, an off-site `callbackURL` and a DNS-rebinding host, each refused with 403;
  - no route hands out the token, and users can't set their own login;
  - production refuses to start without its config.

  I checked that the sign-in test fails with the original `input: false` bug. The landing e2e test clicks "Log in" and checks the request and the message.
- `spec.md` sections 7–10, `CLAUDE.md`, `README.md` and `web/.env.example` describe the setup. The three Supabase key variables were dropped: they were reserved for Supabase sign-in, and nothing read them.

Still open:

- A real GitHub OAuth app hasn't been tried, since that needs your GitHub account. Every step except GitHub's own servers is covered by the callback tests. The steps are in `README.md`.
- A user whose GitHub login is reused after a rename stays signed out until the old holder signs in again.
- Better Auth's rate limits are in memory, like the app's own.

## codebases: landing page, white theme, solution tabs, and 36 more puzzles

Type: Addition, Change

Goal: Give the site its name and a front door, drop the brown look for a plain white one, make solutions a proper tab with detailed explanations, and add puzzles from more repos.

What should be done: Rename the site to codebases with a logo. Put a landing page at `/` with "Log in" (not working yet) and "Continue as guest", plus a scrolling section on why codebase interviews are replacing LeetCode. Move the list to `/puzzles`. Add Description and Solution tabs to the puzzle page. Rewrite every solution into a longer explanation with diagrams where they help. Add puzzles from new repos.

What was done (technical):

- **Theme.** One light theme in `web/app/globals.css`: white background and panels, gray borders, near-black text, blue accent `#2563eb`. The dark palette and the `prefers-color-scheme` switch are gone, and Monaco always uses the light theme (`cb-light`).
- **Logo.** `web/components/site/Logo.tsx`: "code" in Arial, then "bases" in a blue box. Screen readers get one "codebases". The favicon and page titles match.
- **Routes.** Route groups split the app. `app/(marketing)/page.tsx` is the static landing page at `/`, which renders without the database. `app/(app)/` holds the list at `/puzzles`, puzzle pages, profile, and the error and not-found pages, all under the site header. `browseHref` builds `/puzzles?…`. A redirect in `next.config.ts` sends old `/?tag=…` style links to `/puzzles` with their query.
- **Landing page.** A hero with the logo, a tagline, "Continue as guest" (to `/puzzles`) and a "Log in" button that is `aria-disabled` with a "Coming soon" note. Below the fold: why companies are moving to codebase interviews, how it works, the three puzzle types with examples, and a closing call to action. It has no statistics or claims about named companies. A static HTML mock of the IDE stands in for a screenshot.
- **Tabs.** The prompt panel has Description and Solution tabs, using the ARIA tabs pattern with arrow, Home and End keys. Solution is locked until a correct answer and never fetches `/solution` before then. After a correct answer the tab shows an "Unlocked" badge and the answer tray offers "View solution". The solution is fetched once and kept, including under React's development double-run.
- **Markdown.** A shared `Markdown` component adds `remark-gfm` (tables, strikethrough) and keeps `skipHtml`. Fenced `mermaid` blocks render as diagrams through `mermaid` 11.17.2, loaded with a dynamic import only on pages that have a diagram. It runs with `securityLevel: "strict"`, and a `secure` list stops a diagram's `%%{init}%%` from changing the theme or injecting CSS. Diagrams keep their natural size and scroll sideways in the narrow panel, and an Expand button opens a large view. A diagram that fails to parse shows its source instead.
- **Solutions.** All 100 existing solutions were rewritten by three agents, one per group of five repos, each checking the key against the snapshot first. None was wrong. Solutions now run about 55–200 lines with navigation steps, code excerpts with `path:line` references, comparison tables, design background and takeaways. Layouts vary by puzzle. There are 110 mermaid diagrams in all, and every one parses with mermaid 11. A script checked that all 1,056 quoted code lines exist in their snapshot. Several small factual slips in the old solutions were fixed along the way. The solution format is now written in `spec.md` section 4.
- **New repos and puzzles.** Six repos were pinned at their HEAD: `pallets-jinja`, `encode-starlette`, `textualize-rich`, `python-attrs-attrs`, `unjs-unstorage` and `axios-axios` (JavaScript, indexed with `allowJs`). Each has 6 puzzles covering all three types and every answer kind, with 2 easy, 2 medium and 2 hard in most repos. That makes 36 new puzzles, and 136 across 21 repos.
  - `react-hook-form` was tried and dropped. Its logic lives in one 2,465-line closure whose inner functions get no symbols, and its utilities are anonymous default exports, which leaves 75 edges in `src/`.
  - Three blind solvers (`agent:blind-9` to `-11`) solved all 36 from the export only, and every one passed on the first graded attempt.
  - Their notes caught two prompts that misdescribed the code or left a condition open. `rich-find-001` said "while its task is unfinished", but the code checks `not task.completed`, a numeric count. `unstorage-trace-001` didn't say `opts.base` is unset. Both were reworded and re-solved by `agent:blind-12`.
  - A solution rewriter noted that `fastapi-trace-001` didn't rule out `Depends` parameters, which allow longer recursive chains. The prompt now fixes a plain endpoint, and `agent:blind-13` re-solved it.
- **Review.** An independent review found no Rule 1 leaks, and its three findings were fixed: the Unlocked badge's text was white on pale blue, diagrams could inject CSS through `themeCSS`, and old filtered list links lost their filters. New e2e specs cover the landing page, the tabs and unlock, diagram and table rendering, the Expand dialog, and the redirect.
- **Solution audit.** An agent checked 22 solutions line by line against the code. Every answer line matched its key and every excerpt was verbatim. It found three wrong claims (`rtk-architecture-002`, `starlette-find-003`, `axios-find-002`) and one off-by-one line range, all fixed. It also found solutions that give away another puzzle's answer, so a script scanned all 136 solutions for another same-repo puzzle's key: its symbol, file or line, or at least half of its set or sequence. Of 33 flagged pairs, 18 were real leaks, plus one partial, and were rewritten to describe the code without naming the other answer. The other 14 were incidental and left alone.

Still open:

- "Log in" does nothing yet. GitHub sign-in and its UI are the next step, and the local dev login in the header stays until then.
- Rich and unstorage don't fit the 17 topics well, so several of their puzzles are tagged only `code-structure` or `routing`.
- `hono-architecture-001`'s solution has to say RegExpRouter is tried first, which points at `hono-find-003`'s answer file. Fixing that needs a different scenario for one of the two puzzles.
- `h3-find-001`'s window also covers the whole `~findRoute` method, so selecting the whole method is graded correct. That's how windows work, but the window could be tightened.

## Browse puzzles by difficulty and topic

Type: Addition, Change

Goal: With 100 puzzles, a flat table with four drop-downs made the catalogue hard to take in. You should see at a glance what's there and how much you've solved, and get to a difficulty or a subject in one click.

What should be done: Turn the tags into a small fixed set of topics, and organize the list page by difficulty and topic.

What was done (technical):

- **Topics.** The 100 puzzles had about 90 different tags, and most were used once, so filtering by tag mostly found one puzzle. There are now 17 topics, defined in `spec.md` section 4, and the `tags` enum in `content/schema/puzzle.schema.json` rejects anything else, with 1 to 3 per puzzle. Every puzzle was retagged, and each topic covers 5 to 13 puzzles. Tags aren't part of what a blind solver sees, so no blind solve needed redoing. `web/lib/topics.ts` has each topic's label and description, and a test checks that it matches the schema. Two new must-fail fixtures cover an unknown topic and a fourth topic.
- **Difficulty strip.** One bar split by difficulty, each segment's width its share of the puzzles and its filled part the share you've solved. Clicking a segment filters, and clicking it again clears the filter. It replaces the difficulty drop-down.
- **Topic drop-down.** The tag drop-down became a Topic drop-down that lists topics by label. A first version had a row of clickable topic chips with counts, but with 17 topics they took up three rows above the list, so they were removed.
- The strip's counts are taken under the other filters, so each says what clicking would show.
- **Sortable columns.** Clicking a column header sorts every section by that column, A to Z, except difficulty, which goes Easy, Medium, Hard. A second click reverses it. The sort is `sort=title` or `sort=-title` in the URL, and changing the filters or grouping keeps it. Ties keep the default order. Sorting is in `sortPuzzles` in `web/lib/browse.ts`, which compares text with `Intl.Collator`, ignoring case and reading numbers as numbers.
- **Group by** difficulty (the default), topic, repo or none. Each group is a collapsible `<details>` section headed with its solved count and a small progress bar. A puzzle with two topics shows under both. A column the heading already gives is left out of that section's rows.
- Signed out, the counts say how many puzzles there are rather than "0 solved".
- Every control is a link, so the state lives in the URL and works before scripts load. Defaults are left out, so the plain list is still `/`, and old `?tag=` links still work.
- The page now loads every published puzzle once and filters it with the pure functions in `web/lib/browse.ts`. `/api/puzzles` still filters in SQL and is unchanged.
- Tag chips on rows and on the puzzle page show topic labels. A tag outside the list, which only a hand-seeded test database can have, shows as itself.
- New unit tests in `web/tests/browse.test.ts` cover filtering, counting, sorting, grouping and URLs. The e2e tests cover the strip, the topic drop-down, sorting in a flat list and inside groups, every grouping, folding a section, and solved counts after a solve. The e2e fixture puzzles use real topics.
- 487 ingest tests (1 Windows-only skip), 503 web tests against real Postgres and 58 Playwright tests pass, e2e twice in a row. All 100 puzzles validate. Lint, typecheck and build are clean.

## 15 more puzzles, and written difficulty rules

Type: Addition

Goal: More puzzles, at difficulties that a written rule justifies rather than a gut call.

What should be done: Add one puzzle per repo, 5 easy, 5 medium and 5 hard, 5 of each type, each with a reason for its difficulty, verified the same way as the first 85.

What was done (technical):

- **Difficulty rules.** `spec.md` section 4 now defines easy, medium and hard by how much navigation and reasoning an answer takes: how many hops, how much indirection, and how good the decoys are. There was no written rule before.
- **15 puzzles**, one per repo, bringing the total to 100. Trace and hard puzzles were the scarcest (17 and 12 of 85), so the new set adds 5 of each. Answer kinds: 5 sequence, 2 each of symbol, file, location, set and choice.
- Three author agents wrote them (`agent-author-4` to `-6`), and three solver agents (`agent:blind-6` to `-8`) solved them from the export only. All 15 passed on the first graded attempt, recorded in `content/blind-attempts.json`. I also checked every key against the source myself. After the export, the code sample in `rtk-architecture-004`'s prompt was wrapped in a Markdown fence so it renders with its line breaks. The wording is unchanged.
- Two traces use a `sequence-alternate-path` override: `flask-trace-002` and `got-trace-002`. In each, the shorter paths only run on a failure the prompt rules out, and the reason is written in the file.
- Why each is rated as it is:
  - **Easy.**
    - `mobx-find-003`: the prompt names the file and the caller, so it is one jump to definition, with one decoy the prompt excludes.
    - `ajv-find-003`: one jump from the keyword file to the counting helper, with `useFunc` as the only decoy.
    - `click-find-004`: one read of a short function, with one similar `return STRING` branch.
    - `hono-trace-002`: 3 steps in one named file.
    - `fastapi-architecture-003`: one hop from the constructor's `setdefault` calls to the module they import from.
  - **Medium.**
    - `zod-architecture-003`: 3 to 4 hops through the classic layer's renaming re-exports into core, and `.trim()` takes one hop more.
    - `rxjs-find-003`: three `subscriber.complete()` sites in one long operator, and only one runs in the stated scenario.
    - `nest-find-003`: the factory is reached through an interface-typed field, so you have to go back to the container's constructor to see which class is chosen.
    - `httpx-trace-002`: 5 steps across 3 files, with no indirection but one branchy function to read carefully.
    - `requests-architecture-003`: you list the raises in one long method, then check base classes in a second file. `ConnectTimeout` has two bases.
  - **Hard.**
    - `vue-trace-002`: 6 steps, and only the `endBatch` that brings batch depth back to zero runs the effect. The nested one in `Dep.notify` is a real call chain that looks right.
    - `flask-trace-002`: 5 steps whose route depends on the exception type and the trap settings, and the last hop is in the base class in another file.
    - `got-trace-002`: 5 steps starting in an event callback, on a path that only exists in stream mode, with several shorter error paths as decoys.
    - `h3-architecture-004`: you must notice that `mount` copies routes once but wraps middleware for every request, and then follow a request to a 404.
    - `rtk-architecture-004`: an object spread decides which of two case reducers survives, and then a matcher also runs. Each wrong option comes from one misreading.
- `README.md` now says 100 puzzles.
- All 100 puzzles validate. 485 ingest tests (1 Windows-only skip) and 482 web tests pass.

Still open:

- scip-python leaves `requests.exceptions.ConnectionError` out of the requests index, probably because the name shadows a Python builtin. It can't be an answer until that's understood. `requests-architecture-003` excludes it by name.

## Fix doc drift, and lock down client sequences

Type: Fix, Change

Goal: Make `spec.md` and `CLAUDE.md` describe what the code does, and make the rule about locking down new tables something a test enforces, not just a note.

What should be done: Correct the stale routes, commands, columns and connection details, and document what every new migration must do on hosted Supabase.

What was done (technical):

- **spec.md.** Section 6 runs `uv run python -m ingest validate`. Section 7's runtime flow names the real routes under `/api/snapshots/:id/`, plus the outline call, and submit returns `{ correct, attempts }` at `/api/puzzles/:slug/submit`. Section 8 lists `snapshots.content_hash`.
- **The service role was never used.** `spec.md` section 8 and `CLAUDE.md` rule 1 said the server reads answer keys through the Supabase service role. Nothing uses a Supabase client or that key: the server uses `pg` with `DATABASE_URL` everywhere, and refuses to run in production without it. Both now say so. The rule itself is unchanged.
- **New tables on hosted Supabase.** Supabase grants `anon` and `authenticated` everything on each new table, sequence and function in `public`. `supabase/local/shim.sql` now does the same, so the local database behaves like hosted. New tests in `web/tests/rls.test.ts` fail if a table has no row-level security, if clients hold any grant beyond the expected reads, or if they can use a sequence. A throwaway migration that created a table carelessly failed all three. The sequence check picks out sequences in a materialized CTE first, because `has_sequence_privilege` raises an error rather than returning false when the planner tries it on an index.
- **That found a real gap.** 0001 revoked client access to all tables, but sequences aren't tables, so on hosted Supabase clients kept `USAGE` and `UPDATE` on every ID sequence. `UPDATE` allows `setval`, which could wind a sequence back onto existing rows. PostgREST doesn't expose sequences directly, so it was hard to reach, but clients never need it. Migration `0004_revoke_client_sequences.sql` revokes it.
- `CLAUDE.md` says what a migration that adds a table must do. The macOS notes were already added with the macOS work.
- 485 ingest tests (1 Windows-only skip), 482 web tests against real Postgres and 54 Playwright tests pass, e2e twice in a row. All 85 puzzles validate.

## Hardening from the repo audit

Type: Fix, Removal

Goal: Fix the low-severity findings from the repo audit: rate-limit gaps, error handling, blind-solve integrity, input checks on `repos.yaml`, and missing tests.

What should be done: Fix each one with a test that fails before the fix, and measure before changing anything on cost grounds.

What was done (technical):

- **Rate limits.** Signed-out search was keyed on the first `X-Forwarded-For` entry, which the client writes, so each request could pick a fresh bucket. It now uses the last entry, which the nearest proxy appends; Vercel sends one entry, so it's the same there. A rare two-letter query took about 400 ms on fastapi's 20 MB snapshot, since the trigram index needs 3 characters, against about 15 ms for a rare 4-letter one. Queries under 3 characters now also count against a limit of 30 a minute. Search is debounced, so a person sends about one per word.
- **`withTransaction`.** A failed rollback replaced the real error and returned a broken connection to the pool. The real error is now rethrown and the connection destroyed, tested with a fake pool.
- **`readJson`.** A chunked body has no `Content-Length`, so the whole body was read before the size check, and the check counted UTF-16 characters, not bytes. It now counts bytes as they arrive and stops past 256 KB.
- **Sequence removal.** The audit said a `remove` without a `key` removed every item; it actually removed none. No caller did it, but the type allowed it. `remove` (by ID, for sets) and `remove-item` (by key, for sequences) are now separate actions, so it can't be written.
- **Blind solves.** `blind-check` printed pass or fail on every run, so a solver could guess until it passed, and a choice puzzle has 3 to 5 options. Each solver now gets one graded attempt per puzzle version, kept in `content/blind-attempts.json`. A rerun repeats the first result, so `--write` still works after a check without it. The version is a hash of the exported puzzle, not the key, since a hash of a choice ID could be reversed by trying each one. The validator has a new check, `verifier-not-author`, and `blind-check` uses the same name rule: `agent:` stripped and case ignored.
- **`repos.yaml`.** Duplicate slugs and anything but a plain `https://` URL are refused. The URL goes to `git fetch`, where `ext::` and `file://` run or read locally, and into the attribution link on every puzzle page, where `javascript:` would run.
- **Indexer safety on macOS and Linux.** `stage_files` doesn't copy permissions, so staged files are never executable; a test now locks that in. As a second layer, `run_tool` drops relative `PATH` entries, since an empty entry or `.` means the stage dir, where npm's `#!/usr/bin/env node` would find a repo's `node`. The test shows the attack working without the protection. Rebuilt `psf-requests` and `h3js-h3` snapshots are byte-identical.
- **Tests.** The R2 leak scan now reads `.env`, `.env.local` and the like, which it skipped because their suffix isn't a code suffix. Grading cases for a wrong file, a different symbol, an extra sequence element and a repeated one are in `grading-cases.json`; both graders already passed them.
- **Removed** the unused `ingest/validate.py`. Error hints now say `uv run python -m ingest` or `pnpm validate`.
- The `agent-only-note` e2e flake read the note straight after a navigation without `visible()`, which `helpers.ts` says to use there. It passed 24 times in 24 after the change.
- 485 ingest tests (1 Windows-only skip), 478 web tests against real Postgres and 54 Playwright tests pass, e2e twice in a row. All 85 puzzles validate.

Still open:

- Earlier blind solves weren't recorded in the ledger, so it starts empty.
- With no proxy in front, as on localhost, every signed-out client shares the `ip:unknown` bucket. Production needs a proxy that sets `X-Forwarded-For`, which Vercel does.

## Close three open items: the reference cap, unknown puzzles, LOCALDB_PORT

Type: Fix

Goal: Close three "Still open" items from the MVP review: find references could be cut short without saying so, unknown puzzle URLs returned HTTP 200, and `pnpm dev` ignored `LOCALDB_PORT`.

What should be done: Fix each one with a test that fails before the fix, and update the spec's API section.

What was done (technical):

- **The reference cap is explicit.** `/api/snapshots/:id/symbols` asks for 501 references, returns at most 500, and sets `referencesTruncated` when there were more, the way search does. The UI used to guess from the list length, so a symbol with exactly 500 references showed "first 500". Unit tests cover 501+ and exactly 500, and two e2e tests check the label both ways.
- **Unknown puzzles are a 404.** The root `loading.tsx` wrapped every page, so streaming began before the puzzle page could call `notFound()`. The list page and its `loading.tsx` moved into the `app/(list)` route group, and the new `app/puzzles/[slug]/layout.tsx` looks the puzzle up before the puzzle's own `loading.tsx` streams. The layout, metadata and page share one lookup through `web/lib/server/puzzle-page.ts`, which uses React's `cache`. The e2e test now asserts 404 for a missing slug and a malformed one, and 200 for a real puzzle.
- **`LOCALDB_PORT` is honoured everywhere.** `web/lib/server/db.ts`, `web/tests/global-setup.ts` and `ingest seed` now use it as `scripts/localdb.mjs` does, and reject a value that isn't a port. An empty value means the default in the scripts too, rather than port 0.
- **Two e2e races were exposed, both in the tests.** They showed up because the route change shifted page timing. Running the same tests on the commit before this change, and on that commit plus only the route move, showed the move was the trigger.
  - `clickToken` measured a line Monaco had just replaced, because re-rendering detaches a line's elements. The rectangle came back as 0,0, so the test clicked the header. It now measures again when the line is detached or has no size. The F12 test went from 10 failures in 48 to 32 passes in 32.
  - The file-retry test failed exactly one request. When the viewer mounted just as the file was clicked, development's strict mode loaded the file twice: the first load got the 500 and was thrown away, and the second succeeded, so no error showed. The test now fails every request until it clicks "Try again", like the manifest test beside it. Production mounts once, so this was never visible to users. 48 passes in 48, from 3 failures in 24.
- 452 ingest tests (1 Windows-only skip), 464 web tests against real Postgres and 54 Playwright tests pass, twice in a row for e2e. All 85 puzzles validate.

This closes "`LOCALDB_PORT` is only honoured by the scripts", "The `/symbols` route caps references at 500 with no `truncated` flag" and "Unknown puzzle URLs return HTTP 200". The detached-line race in `clickToken` probably also explains the `cursor-symbol` timeouts in the entry below, though those runs weren't traced.

Still open:

- "creates one user from concurrent first logins" timed out at 5 seconds twice in five full web runs right after a restart, while the 15-minute load average was above 20. It passed 10 times in 10 once the load dropped. This change doesn't touch dev login.

## Correctness fixes from the repo audit

Type: Fix

Goal: Fix the bugs a full audit of the repo found, each of which could give wrong data or hide something from the user without saying so.

What should be done: Fix each one with a test that fails before the fix, without weakening any validator check.

What was done (technical):

- **Seeding could empty the site.** A content folder with no `puzzles/` passed validation with 0 puzzles, and seeding then treated every puzzle as removed: it deleted the untried ones and unpublished the rest. `validate_content` now fails when it finds no puzzles.
- **symbol-unique switched itself off.** If a prompt mentioned the answer's own file anywhere, only that file was checked, even when the prompt also named a wider directory. Spec section 6 says the widest scope wins. The directory now takes precedence, with a must-fail fixture. All 85 puzzles still pass.
- **Override reasons were printed.** They're author prose and can name the answer (`ajv-trace-001`'s does), so CI logs could carry it. Only the check name is printed now.
- **Rebuilt snapshots kept a stale cache.** `/snapshots/...` sent `immutable` for a year, but a rebuilt snapshot keeps its name. It now sends `public, no-cache` with a SHA-256 ETag and answers a match with 304.
- **Seeding missed changed file bytes.** The snapshot hash covered the manifest, which records only sizes, so an edit at the same size never reloaded without `--force`. The hash now covers every file's bytes. Re-seeding 15 snapshots takes about 3 seconds; the first run after this change reloads them all once.
- **A result could vanish.** Submitting before `/api/me` answered stored the result under no login, so it was never shown. Submit stays disabled until the page knows who's signed in, with an e2e test that holds `/api/me` back.
- **A changed key left stale progress.** When seeding changes a puzzle's answer key, it now regrades that puzzle's stored submissions with the Python grader and recomputes each user's status and solve time. Each submission keeps its recorded `correct`, which says how it was graded at the time. This closes the open "a user stays `solved` if a puzzle's key later changes".

Still open:

- Under heavy machine load, e2e tests waiting on `cursor-symbol` can time out at 15 seconds, and `agent-only-note` once matched two elements. All passed on a rerun, and with this change and without.

## Run on macOS, and remove giving up

Type: Fix, Removal

Goal: Make the project install, run and test on macOS, since it had only ever run on Windows. Then remove the give-up feature.

What should be done: Fix whatever stops a fresh macOS clone from working, run every suite there, and take giving up out of the site, the API, the database and the docs.

What was done (technical):

- **`pnpm install` failed on macOS.** `pnpm-workspace.yaml`'s `allowBuilds` listed only the Windows `embedded-postgres` package, and pnpm refuses an unlisted build. The macOS and Linux packages are now `true`, because their install script links Postgres's libraries.
- **`README.md` was UTF-16,** so git showed it as binary and plain `grep` found nothing in it. It's UTF-8 now, with macOS install steps for uv and pnpm. The install hints in `scripts/local.mjs` and `fetch.py` no longer give only `winget`. Node is documented as 22 or newer, with `engines` in `package.json`, since everything ran on Node 26.
- **Ctrl+C.** `scripts/local.mjs` starts pnpm without a shell everywhere except Windows, so a signal reaches pnpm. `localdb.mjs` exits cleanly if Postgres already got the signal itself. `scripts/e2e.mjs` now cleans up on Ctrl+C; before, the temp database folder and `.next-e2e` were left behind. Sending Ctrl+C's signal to a running `pnpm local` and to an e2e run left no process, temp folder or build behind.
- The go-to-definition tooltip and spec say cmd-click on macOS. The e2e test stays on Ctrl, with a comment saying why: Playwright's Desktop Chrome profile reports a Windows user agent.
- `.DS_Store` is ignored at the root.
- On macOS (Apple silicon, Node 26) all 15 snapshots built, all 85 puzzles pass `pnpm validate`, and the whole seed took under a minute. 421 ingest tests, 27 seed tests, 457 web tests against real Postgres, and 51 Playwright tests pass.
- **Giving up is gone.** The button, `POST /api/puzzles/:slug/give-up`, `GiveUpResponse` and the `given_up` status are removed. A solution unlocks only after a correct answer. Migration `0003_remove_give_up.sql` turns earlier give-ups into `attempted`, limits `progress.status` to `attempted` and `solved`, and drops `progress.gave_up`. The e2e test that checked solution rendering through giving up now gets there by solving. New tests check that the route is gone and that the database rejects `given_up`.

Still open:

- Snapshots built on macOS weren't compared byte for byte with Windows builds. macOS and Windows both ignore filename case, so neither stands in for a Linux CI build.
- Anyone who gave up earlier is now `attempted`, so they can still solve the puzzle after seeing its solution.

## Review fixes before merging the MVP

Type: Fix

Goal: Act on two independent reviews before merging to main: one attacking the code and the rules, one checking answer keys against the code.

What should be done: Fix what they found without weakening any rule, and record what's still open.

What was done (technical):

- **A repo could run code on Windows.** The npm `.cmd` shims run a bare `node`, and `cmd.exe` looks in the current directory first, so a `node.cmd` in a repo would have run during indexing. None of the 15 has one. `run_tool` now sets `NoDefaultCurrentDirectoryInExePath`, and Windows executables are no longer copied to the stage folder. A test proves the attack works without the protection and fails with it.
- **Rebuilt snapshots never reached the database,** so correct answers were rejected as not in the snapshot. Seeding now compares a `content_hash` (migration 0002) and reloads when it differs.
- **Database failures printed only `undefined`.** They now name the port and show Postgres's last log lines.
- **`pnpm local` printed the wrong address** when port 3000 was busy. It now uses `PORT` strictly and fails rather than moving. It also applies migrations to a database it finds already running.
- **Rule 1 tests skipped silently with no database, and the run still passed.** They now fail unless `ALLOW_NO_DB=1` is set.
- Dev login now refuses requests from other local ports, so another local app can't act on your session. The graders now agree on absurd locations, with cases added to the shared table. A NUL in a page filter is ignored.
- `python -m ingest` replaces the generated launcher everywhere, because Windows Application Control can block generated `.exe` files.
- Answer-key audit of 76 of the 85 puzzles: no wrong keys. It caught three solutions naming stale option letters and five lowercase sentence starts, both from my own bulk edits, plus three ambiguous prompts and three that gave their answer away. Those were rewritten and re-solved. Twelve puzzles were relabelled to their real difficulty. A re-solve then caught that my rewrite of `nest-find-001` allowed a second answer, so it was tightened and solved again.

Still open:

- Blindness of the second solves can't be independently confirmed, and author and solver are similar models. The key audit is the stronger evidence, and it didn't cover the 9 `file` puzzles.
- `LOCALDB_PORT` is only honoured by the scripts, so `pnpm db` on another port needs a matching `DATABASE_URL` for `pnpm dev`.
- A user stays `solved` if a puzzle's key later changes.
- The `/symbols` route caps references at 500 with no `truncated` flag. The UI infers it from the list length; 149 symbols exceed it.
- Unknown puzzle URLs return HTTP 200 with a not-found page, because `loading.tsx` starts streaming first.
- Ctrl+C in a Git Bash window hasn't been tried by hand. It was confirmed in a Windows console.

## Puzzle viewer and 85 puzzles

Type: Addition

Goal: A site you can actually use: browse puzzles, read real code in an IDE, select an answer, get graded, read the solution.

What should be done: Build spec section 10, write and verify puzzles for all 15 repos, and test it end to end.

What was done (technical):

- Puzzle list with URL filters, three-panel puzzle page, Monaco bundled locally with no CDN, go-to-definition, find references and hover from the index, search, outline, answer tray for all six kinds, hints, give-up, solutions, profile, and dark and light themes.
- Monaco is imported without its language services, so every definition and reference comes from the index (rule 7). Prompts, hints and solutions render as markdown with raw HTML dropped.
- `pnpm e2e` runs 52 Playwright tests with its own database and server, from a cold build each time, since reusing a build left the page reloading forever on alternating runs.
- Real data exposed a bug where find references silently dropped results: nest's `Injectable` showed 159 of 873.
- 85 puzzles across 15 repos, 4 to 6 each, covering all three types and six answer kinds. All pass `pnpm validate` and a blind solve by a separate agent, recorded as `agent:<name>`. `b` was the correct option on 10 of 15 `choice` puzzles, so people could guess, and correct options are now spread evenly.

## Fifteen repos, Python indexing and one-command start

Type: Addition

Goal: Have real content to test: 15 repos across TypeScript and Python, loaded and running with one command.

What should be done: Support Python, choose 15 repos that meet spec section 5 and index well, and make the site start with `pnpm local`.

What was done (technical):

- Ten TypeScript repos: hono, vue, nest, zod, rxjs, mobx, redux-toolkit, ajv, got, h3. Five Python: requests, flask, click, httpx, fastapi. Each has 6k to 65k lines of non-test source, and hundreds of call edges in it.
- `uv run ingest snapshot-all` builds them all and prints a table. Each snapshot gets a `summary.json`, and `occurrences.jsonl` now has `end_col`.
- Real bugs fixed, all of which failed silently or gave wrong data: scip-python crashed on load on Windows (a preload shim fixes it) and a forward-slash `--cwd` gave an empty index. Pyright read our own `pyproject.toml` by walking up the tree. Absolute imports under `src/` never matched their definitions. `@overload`s and property setters were reported as references. Decorators, annotations and base classes counted as calls. Forcing `bundler` module resolution took Nest from 0 to 1,015 cross-package edges.
- `pnpm local` starts the database, loads content, and runs the site. On a clean database it loaded 11,860 files, 57,886 symbols and 717,816 occurrences in under 20 seconds.
- Spot-checking 600 random functions and methods across the 15 repos, 590 had their name within the first lines of their stated range. None of the 429 in `fastapi/` itself missed, so its misses are outside its source, such as docs and tests. I didn't look into the misses in the other three Python repos. No snapshot has a dangling edge.

Known gaps:

- TypeScript object-literal members and functions wrapped in a call (`const x = wrap(() => ...)`) get no ID, and calls inside them give no edges. Redux Toolkit is the thinnest for its size, probably because of this, though that's not confirmed.
- scip-python can't give an ID to a class shadowing a builtin, such as `requests.exceptions.ConnectionError`. Attributes in `__slots__` classes add a few false edges.
- Python is indexed as if on Linux, so results are the same on any machine, which leaves Windows-only code without IDs.
- Indexing has only been run on Windows.

Decisions: Express is out, and vitest was rejected because scip-typescript emits a malformed symbol from one of its test fixtures. TypeScript object-literal members stay without IDs, because recovering them would widen the exception to rule 7.

## Puzzle schema, validator, seed and blind-solve tools

Type: Addition

Goal: Stop a puzzle shipping unless it's provably checkable, and load everything into Postgres.

What should be done: Implement every check in spec section 6, the `ingest seed` command, and tools that let a solver answer without seeing a key.

What was done (technical):

- `content/schema/puzzle.schema.json` and `uv run ingest validate` cover the schema, existence and uniqueness checks. Error messages name fields, never values.
- `uv run ingest seed` validates first, skips snapshots already loaded, and upserts puzzles so users keep their progress. 15 synthetic repos of 100k lines took 70 seconds to load and 1.1 seconds to re-seed.
- `blind-export` writes only what a solver may see, with a test that fails if any answer value appears. `blind-check` prints pass or fail only, and won't record a solver who is also the puzzle's author.
- Breaking 18 critical behaviours one at a time, the tests caught all 18.

Fixes after review:

- The Python grader ignored duplicate set members while the web grader rejected them, so a blind solve could pass something the site would mark wrong. Both now reject them, and both test suites run `content/schema/grading-cases.json`.
- `set-count`, `location-window` and `choice-options` can no longer be overridden, since a hand-edited `verified_by` could otherwise publish an unsolvable puzzle.
- Windows made the local database WIN1252, which can't hold every character in real repos. `scripts/localdb.mjs` now forces UTF-8.

## Grader, API routes and dev login

Type: Addition

Goal: Grade answers on the server and give the UI everything in spec section 9, without an answer key ever reaching a client.

What should be done: Build the grader, every API route, the localhost dev login and the route standing in for the CDN, with tests that actively look for leaks.

What was done (technical):

- `web/lib/server/grader.ts` compares IDs exactly for all six answer kinds. Only `submit.ts` reads `answer_json`, and a test enforces that.
- Dev login is refused unless `NODE_ENV` isn't production and the Host, `X-Forwarded-Host` and `Origin` are all local. `pnpm dev` binds to `127.0.0.1`, since a server on all interfaces would let someone on the same network spoof the Host header.
- `/snapshots/<name>/...` serves only `manifest.json` and `files/<path>`, as plain text with `nosniff`. About 20 traversal forms were refused against a running server. A build trace showed its dynamic paths pulling the whole project, including solutions, into the server output; `turbopackIgnore` fixed that.
- 406 web tests run against real Postgres. Breaking 39 protections one at a time, the suite caught all 39.
- Rate limits are in memory and per process: 60 submits and 240 searches a minute. They'd need a shared store before a real deployment.

## Contracts for the localhost MVP

Type: Addition

Goal: Let several agents build the site at once and have the parts fit, with no accounts or API keys needed to run it on localhost.

What should be done: Fix the database schema, API shapes and local stand-ins before any feature work starts, and record them in the spec.

What was done (technical):

- `supabase/migrations/0001_init.sql` implements spec section 8. It adds `snapshots.name`, `occurrences.end_col`, `puzzles.choices` and `puzzles.verified_by`. RLS plus column grants deny clients `answer_json` and `solutions`, confirmed by querying as the `anon` role.
- `scripts/localdb.mjs` runs real Postgres 18 from the `embedded-postgres` npm package, with data in `.localdb/`. No Docker or install needed. `pg_trgm`, roles and RLS all work on Windows. `supabase/local/shim.sql` adds the roles and `auth` schema Supabase provides, so the same migrations run in both places.
- `web/lib/api-types.ts` holds the API shapes. Spec section 9 lists the routes, including the localhost-only `/api/dev/*` and `/snapshots/*`.
- `INGEST_OUT_DIR` and `INGEST_WORK_DIR` let git worktrees share one set of fetched repos and snapshots.

Decisions:

- Localhost mode covers TypeScript, JavaScript and Python. Go isn't installed here and its installer may need admin rights, so it's left for later.
- Express is dropped from the launch repos: it's under the 5k-line minimum and its index leaves most calls unresolved.
- GitHub OAuth, R2 upload and deployment aren't being built yet, because they can't be tested without accounts. A dev login stands in, refused outside localhost and in production.
- A separate agent that never sees the key may do the blind second solve, recorded as `agent:<name>`, and the puzzle page says no person has checked it. Replace these with human solves before a public launch.

## Promote undefined methods to canonical symbols

Type: Change

Goal: Give Express's main methods canonical IDs, since scip-typescript reports `app.listen = function` and `res.send = function` as locals with no definition. This replaces the "known problem" in the entry below.

What should be done: Name these methods without resolving anything by name, then report plainly what still can't be linked. Approved as a narrow exception to rule 7, now written into `CLAUDE.md`.

What was done (technical):

- `_promote` in `convert.py` handles top-level `root.name = function () {}`, including each target of a chain like `req.get = req.header = function`. Computed targets, non-function values and nested assignments don't qualify.
- The root must resolve in SCIP, at its exact position, to a symbol defined in that file. `exports.x` counts when `exports` and `x` share one SCIP local, and its ID has no root, so it reads `lib/utils.js#compileETag`.
- A method is linked to its references only through the SCIP local at its own property position. This gives two tiers, shown in the summary. `scip_local` methods can be callees. `syntax_only` methods have an ID and outgoing edges but can never be a callee.
- Aliases sharing one body each get the outgoing edges.
- On Express this took `lib/` from 14 functions and methods to 66, and from 3 call edges to 21. I read all 21 against the source and each one matches a real reference.

Still missing, and not recoverable from SCIP:

- 60 of 73 `this.method()` calls to same-file methods in `app`, `res` and `req` are unresolved, including all 47 in `response.js` and `request.js`. So `res.*` and `req.*` methods have no incoming edges.
- `app.handle` has no incoming edge and `app.listen` has no outgoing edge, because `app.listen` passes `this` to `http.createServer`. Spec section 4's Trace example can't validate at this SHA.
- `defineGetter(req, 'query', ...)` getters, `app[method]` verbs, and non-function exports like `exports.etag` have no IDs.

## Monorepo scaffold and first ingest pipeline

Type: Addition

Goal: Set up the repo layout from the spec and turn one real repo into a local snapshot, so we can judge whether canonical symbol IDs are readable enough to be puzzle answers.

What should be done: Scaffold `web/`, `ingest/`, `content/` and `supabase/`. Split env files so R2 write credentials never reach `web/`. Pin expressjs/express in `repos.yaml`. Build `uv run ingest snapshot <slug>` to fetch, filter, run SCIP, and write manifest, files, symbols, occurrences and call edges to `ingest/out/`, with no R2 or Supabase. Add tests that need no network.

What was done (technical):

- `web/` is plain create-next-app with `strict` and `noUncheckedIndexedAccess`. `pnpm e2e`, `pnpm validate` and `ingest seed` are stubs that exit 1, so an unbuilt validator can't look like a pass.
- Express is pinned to `1c6f1b0fe4000977b9a7b4f34097e4d527dd9824`, the head of `master` from `git ls-remote`.
- Fetching is a shallow fetch by SHA into a temp dir, then a rename, so an interrupted run never looks cached. `.git/info/attributes` turns off line-ending conversion, because `core.autocrlf` would otherwise change file bytes on Windows and snapshots would differ between machines.
- All filter rules live in `filter_config.py`. Symlinks are also dropped, so a repo can't pull a file from outside itself into a snapshot.
- PyPI's `scip` is an unrelated image-processing package, so `scip.proto` is vendored from scip-code/scip at `bbec5345` and compiled with `grpcio-tools`.
- scip-typescript writes backslash paths on Windows; these are normalized to forward slashes.
- ID decisions: the first holder of a name is bare, then `~2`, `~3`, numbered in source order. Lines and columns are 1-based. Locals, parameters, type parameters, file symbols and scip-typescript's meta descriptors like `weak0:` get no ID.
- scip-typescript gives no enclosing range for `a.b = function () {}`, so tree-sitter finds only where a definition ends, starting from the exact position SCIP reports. SCIP still decides what a symbol is and what refers to it. No names are matched.
- A call edge is a reference inside a callable's body, assigned to the innermost named callable. The left side of `View.prototype.lookup = ...` doesn't count. A callee has to be callable, so a variable holding a required function produces no edge.

Known problem: on Express `master` only 3 of the 9 call edges are in `lib/`. scip-typescript reports `app.listen = function`, `res.send = function` and `req.get = function` as local symbols with no definition, so about 43 methods and 12 `defineGetter` getters have no ID. Installing dependencies didn't change this. The pipeline reports the gap rather than recovering these by name, which rule 7 forbids. This blocks Find and Trace puzzles on those methods until it's decided how to handle it.

Also open: Express `master` has about 2,776 lines in `lib/` and `index.js`, below the 5k minimum in spec section 5, and no `lib/router/`, so the spec's `lib/router/layer.js#Layer.match` example doesn't exist at this SHA.
