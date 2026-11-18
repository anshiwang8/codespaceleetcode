# Learn, Challenges and Brand Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Learn catalog and lesson page, rebalance Challenges with a visual streak, replace the logo with the mascot, and apply button motion and sixteen craft details site-wide.

**Architecture:** One lead slice lands shared CSS tokens, button motion, the API type and shared helpers. Three builders then work in parallel on disjoint files (brand, Learn, Challenges) against those interfaces while the lead generates illustrations. Theme removal, critique and verification follow.

**Tech Stack:** Next 16.4.6 App Router, React 19.3.0 (`ViewTransition`), CSS modules and tokens in `web/app/globals.css`, vitest, Playwright, sharp.

**Spec:** `docs/superpowers/specs/2026-11-17-learn-challenges-brand-design.md` (section letters below refer to it). Read it and `CLAUDE.md` first.

## Global Constraints

- No animation library, no new font files, no new runtime dependency.
- Motion is finite, off under `prefers-reduced-motion`, and uses the tokens in `globals.css`. The only bounce is `.resultCheck`. Never `transition: all`.
- Component colors come from theme tokens, except the mascot's fixed colors and `--plate`.
- Answer keys, unrevealed hints and graded results never reach the client early; no `"use client"` file imports `course.generated.ts`, `lib/learn/course.ts` or `lib/server/learn`.
- US English, sentence case, icons from `Icon.tsx`, monospace only for code, paths and IDs.
- Builders edit only the files their task lists. Shared files belong to the lead. Builders do not run `git commit`; the lead commits each slice.
- Each builder runs vitest with its own database: `TEST_DATABASE_NAME=codebase_puzzles_test_<task> npx vitest run`.
- Existing `data-testid` values stay unless a task says they change.

## Review Focus

1. Progress loads late or fails on `/learn`: the Continue panel and node states must not shift layout (test in Task 3).
2. A challenge card with `puzzle: null` (withdrawn): the bar shows "Withdrawn" and no button (test in Task 4).
3. A streak where `current === longest` and is 0, 7 or 400: the bar scale and label stay sensible (test in Task 4).
4. A saved theme that has been removed: page paints the default theme, with no flash of the removed one (test in Task 6).
5. Reduced motion: no transform, stagger or view transition runs anywhere (checked in Task 7).

---

### Task 1: Shared foundation (lead)

**Files:**
- Modify: `web/app/globals.css`, `web/app/layout.tsx`, `web/lib/api-types.ts`, `web/components/site/Icon.tsx`
- Create: `web/components/site/PressOrigin.tsx`
- Test: `web/tests/foundation.test.ts`

**Interfaces — Produces:**
- Tokens: `--tracking-title: -0.015em`, `--tracking-heading: -0.01em`, `--tracking-label: 0.01em`, `--measure-prose: 68ch`, `--measure-lede: 60ch`, `--hit-min: 44px`, `--plate` (cream, OKLCH), `--motion-press: 160ms`, `--press-scale: 0.97`.
- Mascot colors, each OKLCH with a hex comment: `--mascot-body`, `--mascot-body-deep`, `--mascot-mint`, `--mascot-teal`, `--mascot-ink`, `--mascot-face`, `--mascot-blush`, `--mascot-edge` (transparent in light schemes, light in dark).
- Classes: `.btn` gains press scale and hover gating (F1, F2); `.btn-forward` slides a trailing `Icon` 2px on hover (F4); `.hit-area` expands a target to `--hit-min` with `::after` (F7); `.stagger-in` reads `--i` and delays `min(var(--i), 5) * var(--motion-stagger)` (C9); `.plate` is the fixed illustration surface.
- Global type: headings `text-wrap: balance`, paragraphs `text-wrap: pretty`, `font-kerning: normal`.
- View transitions: `::view-transition-group(.morph)` at `--motion-panel`, `::view-transition { pointer-events: none }`, all view-transition animations zero-length under reduced motion.
- Page gutters use `max(var(--page-gutter), env(safe-area-inset-left))` and the right equivalent; `viewportFit: "cover"`.
- `PressOrigin`: a client component mounted once in the root layout; on `pointerdown` inside a `.btn-primary` it sets `--press-x` and `--press-y` (px within the button) on that button. CSS draws the one-shot radial highlight (F3).
- `ChallengeStreak.recentDays: string[]`: completed UTC dates (`YYYY-MM-DD`, ascending) within the last 35 days including today.
- Icons: `arrow-right`, `flame`.

- [ ] Step 1: Write `foundation.test.ts`: reads `globals.css` and asserts each token and class above exists, that no rule contains `transition: all`, and that every `.btn` `:hover` rule sits inside `@media (hover: hover) and (pointer: fine)`.
- [ ] Step 2: Run it; expect failures.
- [ ] Step 3: Implement the CSS, `PressOrigin`, the layout change, the type and the icons.
- [ ] Step 4: Run `foundation.test.ts`, `npx vitest run tests/blend.test.ts tests/themes.test.ts`, lint and typecheck; expect passes (typecheck fails only where `recentDays` is not yet returned, fixed by setting it in `web/lib/server/challenges.ts` to `[]` until Task 4).
- [ ] Step 5: Commit.

### Task 2: Logo and mascot (brand builder)

**Files:**
- Create: `web/components/site/mascot.ts`, `web/components/site/Mascot.tsx`
- Modify: `web/components/site/Logo.tsx`, `web/components/site/logo.module.css`, `web/scripts/brand-icons.mjs`, `web/app/opengraph-image.tsx`, `web/tests/landing.test.ts` (brand parts only)
- Delete: `web/components/site/mark.ts`
- Generated: `web/app/icon.svg`, `web/app/apple-icon.png`, `web/public/brand/*`

**Interfaces:**
- Consumes: the `--mascot-*` tokens from Task 1 (hex values duplicated as constants in `mascot.ts` for the script and the preview image).
- Produces: `Mascot({ form = "full", className }: { form?: "full" | "head"; className?: string })`, decorative, square viewBox, sized by its container's width. `Logo` and `LogoMark` keep their current props.

- [ ] Step 1: Update the brand tests to expect `mascot.ts` geometry in each generated file, the favicon to be the head-only form, and `Logo` to render the wordmark as paths with `fill="currentColor"`.
- [ ] Step 2: Run them; expect failures.
- [ ] Step 3: Draw the head and full forms as SVG shapes in `mascot.ts` from `Codebases Mascot Brand Identity.png` (spec A1 to A4, A8), and the wordmark paths (A3).
- [ ] Step 4: Rewrite `Logo.tsx`, `Mascot.tsx`, `brand-icons.mjs` and `opengraph-image.tsx`; run `node scripts/brand-icons.mjs`.
- [ ] Step 5: Render a comparison image (reference beside the redraw at 32, 64 and 512px, light and dark backgrounds) to `docs/superpowers/specs/assets/mascot-compare.png` for the owner's sign-off (A9).
- [ ] Step 6: Run the brand tests, lint and typecheck; expect passes. Report; do not commit.

### Task 3: Learn catalog and lesson page (Learn builder)

**Files:**
- Modify: `web/app/(app)/learn/page.tsx`, `web/app/(app)/learn/[slug]/page.tsx`, `web/components/learn/*`, `web/tests/learn.test.ts`, `web/e2e/learn.spec.ts`
- Create as needed under `web/components/learn/`: `GroupSection.tsx`, `LessonNode.tsx`, `GroupIndex.tsx`, `ContinuePanel.tsx`

**Interfaces:**
- Consumes: Task 1 tokens and classes; `Mascot` from Task 2 (import path `@/components/site/Mascot`; until it lands, the header reserves a square box); images at `/learn/group-<1-4>-{480,960}.webp` inside a `.plate` with `aspect-ratio: 3 / 2` (render the plate even if the file is missing).
- Produces: nothing other tasks import.

- [ ] Step 1: Tests first. vitest: the catalog page module still imports no client-forbidden module; every row link is at least 44px tall in CSS (`min-height: var(--hit-min)`); the "Suggested first" text is absent from the catalog markup. e2e: `continue-learning` is visible without scrolling at 1440 by 900; `catalog-<slug>` rows remain; clicking a row lands on the lesson with its title visible; a correct exit check updates `lesson-status` without a reload; progress loading causes no layout shift (compare the `continue-learning` button's bounding box before and after `learn-progress` leaves `aria-busy`).
- [ ] Step 2: Run them; expect failures.
- [ ] Step 3: Build spec section C (C1 to C13) and D (D1 to D10). The row title and the lesson header share `<ViewTransition name={"lesson-" + slug} share="morph" default="none">`.
- [ ] Step 4: Run the Learn tests, `cd ingest && uv run python -m ingest learn` (must report nothing stale), lint and typecheck; expect passes. Report; do not commit.

### Task 4: Challenges (Challenges builder)

**Files:**
- Modify: `web/app/(app)/challenges/page.tsx`, `web/app/(app)/challenges/loading.tsx`, `web/components/challenges/*` except `TodayStrip.tsx` behavior, `web/lib/server/challenges.ts`, the challenges tests in `web/tests/`, `web/e2e/challenges.spec.ts`
- Create: `web/components/challenges/StreakBar.tsx`, `StreakCalendar.tsx`, `web/lib/streak-display.ts`

**Interfaces:**
- Consumes: `ChallengeStreak.recentDays` and tokens from Task 1; `Mascot` from Task 2 for the signed-out panel.
- Produces: `streakScale(current: number, longest: number): { max: number; nextLabel: string | null }` in `streak-display.ts`. Scale ends at `max(7, longest)`; when `current === longest`, it ends at the next of 7, 14, 30, 60, 100, 200, 365 above `current` with `nextLabel` such as `"Next: 14 days"`; above 365 the scale is `current` and the label is `null`.

- [ ] Step 1: Tests first. `streakScale(0,0)` is `{max: 7, nextLabel: "Next: 7 days"}`; `(3,10)` is `{max: 10, nextLabel: null}`; `(7,7)` is `{max: 14, nextLabel: "Next: 14 days"}`; `(400,400)` is `{max: 400, nextLabel: null}`. `challengeStreakFrom` returns `recentDays` limited to the last 35 UTC days, ascending. A card with `puzzle: null` renders "Withdrawn" and no link. e2e: each of `challenge-daily`, `challenge-weekly`, `challenge-monthly` shows its type, a countdown, points and one button; the three bars' columns share x positions; at 1440 wide the bars column and the streak column have equal heights (within 1px).
- [ ] Step 2: Run them; expect failures.
- [ ] Step 3: Build spec section E (E1 to E12). Keep `challenge-bonus`, `challenge-streak*` and `challenge-count-*` test IDs; `challenge-puzzle` moves onto the bar's button; `challenge-rotation` moves into the disclosure.
- [ ] Step 4: Run the challenges tests, lint and typecheck; expect passes. Report; do not commit.

### Task 5: Illustrations and header polish (lead, parallel with 2 to 4)

- [ ] Step 1: Generate the four images with the prompts in spec B2, in the owner's Chrome.
- [ ] Step 2: Convert with sharp to `web/public/learn/group-<n>-{480,960}.webp`; sample `--plate` from them.
- [ ] Step 3: Header files: F6 (menus scale from their trigger corner), F10 (44px targets on touch), in `SiteHeader`, `NavLinks`, `AuthControl`, `AccountMenu`, `site.module.css`, `web/components/themes/*`.
- [ ] Step 4: Commit each.

### Task 6: Remove clashing themes (themes builder, after Task 5)

**Files:** `web/lib/themes/**`, `web/tests/themes.test.ts`, `web/scripts/theme-clash.mjs` (new), generated catalog and `docs/themes/MAPPING.md`.

- [ ] Step 1: Write `theme-clash.mjs`: scores every theme by spec H2 and writes a contact sheet and a list to `docs/superpowers/specs/assets/`.
- [ ] Step 2: Stop. The lead shows the list to the owner (H3).
- [ ] Step 3: After the owner confirms: tests first for H5 (server read, controller, pre-paint cache each fall back to the default for a removed id), then the exclusion list with reasons, then regenerate.

### Task 7: Critique, fix, verify, document (critic, QA, lead)

- [ ] Step 1: Critic reviews `/learn`, one lesson and `/challenges` at 375 and 1440, light and dark, reduced motion on and off; accessibility pass. Lead assigns fixes to the owning builder.
- [ ] Step 2: `pnpm test`, lint, typecheck, build, `pnpm validate`, `pnpm e2e`, `pnpm smoke`.
- [ ] Step 3: Recapture landing screenshots; update `CLAUDE.md`, `spec.md` section 10 and `DEVLOG.md`.
