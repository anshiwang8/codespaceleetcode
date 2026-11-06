# Design audit: codebases

Date: 2026-11-06. Branch: `codex/claude-design-motion` (worktree `codespaceleetcode-design`, based on `main` at `d415f7d`).

## Scope and method

This is a qualitative audit of the running app. It isn't an AI-provenance check: a screenshot can't show who wrote the code or how carefully it was reviewed. The three meanings of "vibe coded" were kept apart:

- **A process** (Martin Fowler's sense: accepting generated code without meaningful review). This audit can't establish it from the outside, and doesn't try.
- **Conventions associated with site generators**, such as a centered hero, two buttons and a row of identical cards. These are a problem only when they pile up without serving the product.
- **Low-quality work**: generic, misleading or unfinished, whoever made it. This is what the audit fixes.

No font, color, framework or component was treated as evidence on its own. HTTP Archive's 2025 look at purple and indigo CSS variables found no clear surge, and its method has limits, so the blue accent was judged only on whether it serves this product. The research behind the brief was qualitative, mostly readable Reddit and Hacker News threads plus UX and engineering sources. Nothing here claims a cross-platform consensus or a prevalence figure.

Evidence:

1. `VISUAL_PHASE=before pnpm visual:review --grep gallery` in this worktree: 4 tests passed, 29 PNGs in `web/visual-review/before/` (ignored by git, kept locally). I opened `landing-1440`, `puzzles-375`, `profile-signed-out-768`, `workspace-selected` and `workspace-correct` at full size.
2. Reading the source of the landing page, header, list, answer tray, profile and the shared CSS, including the motion system already on `main`.
3. Checking that every landing example is consistent with `spec.md` (answer kinds, gating, verification).

Severity: **High** means trust, accuracy, function or accessibility. **Medium** means clarity, product evidence or predictability. **Low** means visual refinement. "Defect" marks something wrong; "Subjective" marks a judgment call.

## Findings

### Landing page (`/`)

| # | Lens | Kind | Severity | Evidence | Disposition |
| --- | --- | --- | --- | --- | --- |
| L1 | Copy, trust | Defect | High | The H1 says "Practice the interview that's replacing LeetCode", and the why section says "companies are moving away from algorithm puzzles". Code-reading rounds exist at some companies, but many still ask algorithm questions. Nothing on the site supports "replacing". | **Fix.** Describe what the product is. Mention interviews only as "some interviews", with no trend claim. |
| L2 | Trust | Defect | High | The comparison cards say a well-known algorithm problem "is easy to hand to an AI assistant", implying codebase puzzles aren't. AI assistants can read a repository too, so the implied advantage is unsupported. | **Fix.** Remove the comparison block. |
| L3 | Product evidence | Defect | Medium | The hero "IDE" is invented code (`src/router.ts`) in a window with macOS traffic-light dots. It contains a "Submit" chip styled like a button that does nothing. It shows no real repository, commit or navigation step. | **Fix.** Replace it with a static example built from real `psf/requests` source at the pinned commit `3c7baaa`: the question, the lines, how you get there (search, then go to definition), the answer as a canonical ID, and the feedback. Label it static and not a puzzle, with a working link to the file on GitHub. No element looks like a control. Its answer (`CaseInsensitiveDict`) is checked not to be any puzzle's answer, file or symbol. |
| L4 | Accuracy | Defect | Medium | The Architecture card's answer is `src/logging/`, labeled "A module". Directories aren't an answer kind (spec section 3). The Find and Trace examples use made-up IDs presented as if real. | **Fix.** Each card states its real answer shapes (Find: one symbol, file or line range; Trace: an ordered chain of symbols; Architecture: a set of files and symbols, or one of several options) and shows the canonical ID format. |
| L5 | Composition | Defect | Medium | "How it works" heading sits about 180px right of its label and cards at 1440px. `.tinted > *` and `.h2` have equal specificity, and `.h2` (later) keeps `max-width: 720px` with auto margins. | **Fix.** The new section has no auto-margined children. |
| L6 | Composition | Subjective | Low | The logo appears in the top bar and again at 72px above the H1. Every section opens with an uppercase blue eyebrow ("WHY THIS EXISTS", "HOW IT WORKS", "THREE KINDS OF PUZZLE") that repeats its H2. | **Fix.** One logo, in the top bar. Plain H2s carry the outline. |
| L7 | Hierarchy | Subjective | Medium | "How it works" is five identical bordered cards with numbered tiles; at 375px that's a long column. Two cards repeat the hero ("answer by clicking", "graded exactly"). | **Fix.** A short numbered list of what you do, next to a list of what the site doesn't do. |
| L8 | Predictable actions | Defect | Medium | "Continue as guest" doesn't say that guests can read but not submit. The "Sign in" note says only "with GitHub", not why you'd sign in. Visitors discover the gate only after pressing Submit. | **Fix.** "Browse puzzles" plus a line saying reading is open and submitting needs sign-in. The button is "Sign in with GitHub" with the note "to submit answers and save progress". |
| L9 | Copy | Subjective | Low | The closing section repeats the hero's button, with "No setup, no install. Pick a puzzle and go." | **Fix.** One specific next step: "Try an easy Find puzzle", which opens the list filtered to easy Find puzzles. |
| L10 | Trust | Gap | Medium | The landing page doesn't mention limits a visitor should know: every second solve so far was done by an automated agent (the puzzle pages say so), the IDE needs a laptop-size screen, and no code runs. | **Fix.** State them in the "what it isn't" list. |
| L11 | Visual system | Keep | — | Blue accent, system UI font, white background, 6–10px radii, sticky top bar, three puzzle-type cards. | **Keep.** They fit a developer tool and the spec's identity. Find, Trace and Architecture are three real, parallel concepts, so three cards suit them. Changing palette or font would be fashion, not a fix. |
| L12 | Trust | Keep | — | No user counts, testimonials, logos, portraits or metrics anywhere. | **Keep.** None added. |

### App pages

| # | Lens | Kind | Severity | Evidence | Disposition |
| --- | --- | --- | --- | --- | --- |
| A1 | Predictable actions | Defect | Medium | `workspace-*`: signed out, the answer tray shows an enabled "Submit answer". The sign-in requirement appears only after the click. | **Fix.** Signed out, the tray says "Reading is open to everyone. Sign in to submit an answer." before the button. Clicking still keeps the selection and shows the sign-in prompt. |
| A2 | Visual defect | Defect | Low | `profile-signed-out-768`: the header button reads "Sign in␣␣as dev-visual". `.btn`'s flex `gap` adds to the detail span's leading space. | **Fix.** One label span inside the button. |
| A3 | Visual defect | Defect | Low | `puzzles-375`: in card rows the status glyph touches its label ("○Not started"). | **Fix.** A fixed glyph box with a gap. |
| A4 | Copy | Subjective | Low | The list's signed-out hint says "Sign in to keep track of what you've solved" but not that submitting needs it. | **Fix.** "Sign in to submit answers and keep track of what you've solved." |
| A5 | Accessibility, feedback | Gap | Low | `workspace-correct`: the result is a green or red box with the word Correct or Incorrect and no icon. Color plus word is enough, but the moment of solving has no focal point. | **Fix.** A ✓ or ✗ icon in a fixed 20px box. The ✓ gets the bounce (see Motion). |
| A6 | Density | Keep | — | The list's table, the IDE's 13px panels, the profile's breakdown rows. | **Keep.** Dense where comparison matters; cards only for browsing unfinished puzzles. |
| A7 | Interaction | Keep | — | Duplicate-submit guard, stale-response rejection, request cancellation, history focus and two-step delete were added and tested earlier (`e2e/motion.spec.ts`, `e2e/profile.spec.ts`). | **Keep**, and re-run their tests. |

### Motion

| # | Kind | Disposition |
| --- | --- | --- |
| M1 | Addition | **Bounce:** the ✓ in a correct result scales in with one overshoot (about 300ms), inside a fixed 20px box, so the result box, its text and the View solution button don't move. It plays once per new result, because the box is keyed by attempt count. Reduced motion shows the ✓ immediately. |
| M2 | Keep | Short entrances for results and panels, inset pressed feedback, once-only landing reveals, left-anchored progress transforms. All finite, all off under reduced motion. |
| M3 | Keep | No motion on Monaco, code text, tree targets, editor tabs or splitters. No animation on the landing example, which is a static figure. |

### Performance

No new libraries, images or fonts. The landing page stays static HTML (`force-static`) and renders without the database. Animations use `transform` and `opacity`. No lab score is presented as field Core Web Vitals.

## Results

Every finding above marked **Fix** was fixed; every **Keep** was left as is.

### What changed

- **Landing (L1–L10):** `web/app/(marketing)/page.tsx` was rewritten.
  - The hero now reads "Practice reading code you didn't write." It describes what a puzzle asks and the IDE, then "Browse puzzles" and "Sign in with GitHub" ("to submit answers and save progress"), with a line saying reading needs no account.
  - The made-up IDE picture became `components/landing/CodeDemo.tsx`, a worked example from `psf/requests` at `3c7baaa`. It's captioned as static and not a puzzle, has no buttons, and its one link goes to the file at that commit.
  - The five step cards became four numbered steps beside "What it doesn't do". The eyebrows, the second logo and the AI comparison are gone.
  - The type cards quote real puzzles (`components/landing/examples.ts`), with the correct answer shapes and placeholder ID formats.
  - The closing section links to the list filtered to easy Find puzzles.
  - `landing.module.css` was rewritten on the global tokens (766 to 720 lines). The misaligned heading went with the old `.tinted > *` rule.
- **App (A1–A5):**
  - Signed out, the answer tray says sign-in is needed before Submit is pressed.
  - The header's dev sign-in label is one span, so it has one space.
  - List status glyphs are centered in their box.
  - The list's signed-out hint mentions submitting.
  - Results show a ✓ or ✗ in a fixed 20px circle.
- **Motion (M1):** `--motion-bounce` (keyframe `motion-bounce`, 320ms, one overshoot to 1.2 scale) on `.resultCheck`. Reduced motion sets `--motion-bounce-time: 0ms`. The hero stagger is down to at most 90ms.

### Verification (this worktree, one suite at a time)

| Check | Result |
| --- | --- |
| `pnpm visual:review` | 10 passed: 6 motion tests, including the new bounce test, and 4 gallery tests, 29 screenshots |
| `pnpm e2e` | 95 passed |
| Web unit tests, throwaway Postgres | 20 files, 592 passed, including the new `tests/landing.test.ts` |
| Ingest tests, throwaway Postgres (seed tests on) | 516 passed, 2 platform skips |
| `pnpm validate` | 136 of 136 puzzles |
| ruff, ruff format, pyright | Clean |
| Production build and `pnpm smoke` | Build passed, `/` still static; 7 of 7 smoke tests |
| Lint, typecheck | Clean |

Screenshots: `web/visual-review/before/` and `web/visual-review/after/` (ignored by git), with `web/visual-review/index.html` as the gallery. I inspected the final landing, list, profile and workspace images at full size. The two refinements this caused are in `VISUAL_REVIEW.md`.

How the bounce was verified: `e2e/motion.spec.ts` slows it to 1500ms with a style override and checks that it's running with one iteration. It seeks through it to confirm the peak scale is between 1.1 and 1.3, checks that the 20px wrapper, the result box and the View solution button keep their positions, and waits for it to end at an identity transform with exactly one `motion-bounce` start. It also checks that a wrong answer starts no bounce and that reduced motion gives a zero duration with the ✓ fully visible.

### Remaining limits

- Lab checks only: no field Core Web Vitals were measured or claimed. The landing page has no images, web fonts or new scripts, and stays static.
- Browser coverage is headless Chromium on macOS. Safari and Firefox weren't run.
- The worked example is static by design. It doesn't show the IDE's real interactions. The caption says so, and the puzzle pages are one click away.
- Another session (Codex, branch `codex/design-motion-audit` in `~/.codex/worktrees/design-motion-audit`) was doing an audit with the same brief at the same time. Nothing here reads from or writes to it. The two branches overlap in files such as `globals.css`, the landing page, `AnswerTray.tsx` and `AuthControl.tsx`, so merging both would need a manual reconciliation.
