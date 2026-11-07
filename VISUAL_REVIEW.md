# Motion and visual verification

Run from the repository root:

```sh
pnpm visual:review
```

The command creates a temporary Postgres database, seeds the existing tiny repository fixtures, prints its free localhost URL, and starts Next in `.next-visual`. It needs no account secrets and never uses the developer database. The app and database stop afterward. Chromium is installed through the existing e2e runner. Run only one visual review at a time; its build and artifact directories are deliberately separate from development, normal e2e and production smoke checks.

Open [the generated gallery](web/visual-review/index.html). Final PNGs are under `web/visual-review/after/`; `results.json`, `run-report.md` and per-width gallery manifests record test results, local instance identity and browser issues. These generated files are ignored by git and retained locally. `pnpm visual:review --grep gallery` captures layouts only; `pnpm visual:review motion.spec.ts` runs motion checks only. The complete command runs both. `VISUAL_PHASE=before pnpm visual:review --grep gallery` can capture a baseline before a future edit (POSIX shells).

## Coverage and readiness

| States | Viewports |
| --- | --- |
| Every theme on four contact sheets; list, landing, profile, Settings, theme dialog and workspace in 7 themes; Settings and theme dialog in 2 themes | 1440×900; 375×812 |
| Landing; default, filtered and empty puzzle list | 375×900, 768×900, 1440×900 |
| Signed-out, new-user, populated/long-login profiles; Settings and its deletion confirmation | 375×900, 768×900, 1440×900 |
| Workspace locked solution, selected choice, incorrect/correct feedback, unlocked solution | 1366×800 |
| Profile activity: dense history (about 14 months), a past calendar year, a keyboard-picked empty day with zero history results, period loading, recoverable activity and history failures, a sparse account with every puzzle solved and a very long repository name, all puzzles solved | 375×900, 768×900, 1440×900 |

The gallery screenshots retain motion and wait for explicit route content, hydrated account controls, fonts and no running/pending animations. Landing sections are scrolled into view once before full-page capture. History uses stable synthetic UTC activity and deterministic fixture names. The gallery checks document overflow and intersecting header control rectangles. Deletion is never submitted by screenshot tests. Only public fixture choices appear in workspace screenshots; the unlocked solution body is masked.

Motion tests run separately and check actual animation starts and termination, one-time viewport reveals, reduced-motion durations/delays and left-anchored progress, absent JavaScript and a silent observer, rapid native group toggles, filter-pending feedback, navigation interruption, keyboard focus, progress changes without layout changes, history append position/focus, repeated cancellation, in-flight answer changes, duplicate submission prevention, solution tab focus, Monaco node identity, the activity tracker (no square ever animates, including across a period change; a picked date keeps the cell's size and place and fades its selection strip in once; reduced motion leaves nothing running), and the correct-result bounce (it starts, plays once, peaks between 1.1 and 1.3 scale, ends at rest, leaves the result box and View solution button unmoved, doesn't play for a wrong result, and has no duration under reduced motion). Request interception uses explicit gates, and animation readiness uses bounded state polling instead of long sleeps. Browser exceptions, console errors, failed requests (excluding normal navigation aborts) and failed application responses fail gallery/representative motion checks. A separate pending-button test explicitly expects and asserts a simulated provider refusal.

## Inspection record — November 6, 2026

The initial captures were reviewed, the following problems were corrected, and the final gallery was captured and inspected again:

- Shared keyframes were scoped incorrectly by CSS modules; custom-property names now refer to global keyframes. A mistyped `backward` fill value was corrected to the CSS keyword `backwards`.
- A completed/canceled animation could leave a `finished` promise pending. Review readiness now polls actual animation state with a five-second bound.
- Disabling the history button dropped keyboard focus. The stable button now uses `aria-disabled` and guards repeated requests.
- At 375px the signed-out button overlapped Profile despite zero document overflow. Compact visible sign-in labels preserve the full accessible name; the header can wrap when both sign-in methods are present. Pairwise header-rectangle checks cover this regression.
- The landing sign-in error message widened its wrapper and shifted the button. The wrapper and button now reserve the pending label’s width; the focused test compares position and dimensions before, during and after a refused sign-in.
- Difficulty selection no longer changes the strip's height. Progress fills transform inside fixed tracks, with numeric values immediately readable.

Available early `before/` images are partial: the checkout's existing profile changes were still being completed during that capture. They are context, not approved pixel baselines. No changed image was automatically accepted.

## Inspection record: design audit pass, November 6, 2026

This pass followed `DESIGN_AUDIT.md`. `VISUAL_PHASE=before pnpm visual:review --grep gallery` captured `before/`. After the changes, the final gallery was inspected at full size, two problems were fixed, and it was captured again:

- At 1440px the worked example's three columns left the code too narrow: line 20 was cut off and the answer ID broke mid-word. The example now puts the question and answer on the left and the code on the right, and long code lines wrap on a phone instead of scrolling inside a region a keyboard can't reach.
- The sign-in note wrapped to two lines and repeated the line under the buttons. The note now fits on one line, and the hero line only says reading needs no account.

Checked by eye in the final images: landing at 375, 768 and 1440 (and the hero at 375 and 768 in a dev server), the header's dev sign-in label at 768, list status glyphs at 375, the signed-out answer tray, and the correct, incorrect and unlocked workspace states. The bounce was verified by the motion test, not from screenshots.

## Inspection record: profile and activity tracker, November 6, 2026

The profile gallery was captured with `pnpm visual:review`. The images were opened at full size, or cropped to the tracker and history, at 375, 768 and 1440px. That inspection found and fixed:

- A React key warning, raised in the browser, when server-rendered sections were passed into the client wrapper. The wrapper now renders those sections from data, so no server-created elements cross into it.
- After a failed period load, the Period picker named the period that failed while the calendar still showed the previous one. The picker now names what's shown, except while a load is in flight, and the error names both periods.
- At 375px the Result filter's default label was cut off; it's now "All results". On a narrow screen the weekday labels scrolled away with the weeks; they're now pinned.
- The calendar squares were small on a wide screen. They're 14px from 1100px up, and the summary line no longer repeats the active-day count.

Checked by eye in the final images: dense and sparse activity, the rolling period and a past year, hatched dates before the account's history, the today ring, the selected-day ring and strip with zero history results, loading and both recoverable errors, 100% completion, and wrapping of a 39-character login and a 66-character repository name.

## Inspection record: themes and settings, November 6, 2026

`e2e/visual-themes.spec.ts` (part of `pnpm visual:review`) writes to `web/visual-review/after/themes/`:

- `contact-sheet-1.png` to `contact-sheet-4.png`: every one of the 189 themes as a card drawn only from its tokens: its name and ID, secondary text, a link, the default avatar, the primary and danger buttons, a picked chip, the Correct, Hint and Wrong chips on their tints, the five heat levels, and two lines of syntax colors on the editor background.
- Key screens at 1440px (puzzle list, landing, a dense profile, Settings with an inline error, the theme dialog, and the workspace after a wrong answer) in 7 representative themes: `default-light`, `default-dark`, `dracula` (saturated dark), `arch` (near-black), `botanical` (light, background moved off mid-gray), `diner` (dark, moved the same way) and `beach` (the accent needing the biggest change).
- Settings and the open theme dialog at 375px in `default-light` and `dracula`.

All four contact sheets were inspected in halves at full size, and the dracula Settings, botanical workspace, diner profile and both phone dialogs opened at full size. That found and fixed:

- The theme list's visually hidden radios were positioned against the page instead of their option, so Settings ran about 1000px of empty page past its end (4256px tall, now 3301px).
- On a phone the theme dialog put Apply and Cancel under the list and preview, off the first screen. They now sit right under a shorter list.

After review the Theme button moved from the header to the profile page, beside "Browse puzzles", and the picker lost its "n of N shown. Saved: …" line. The profile's top and the phone dialog were captured and inspected again (`*-profile.png`, `*-profile-375.png`, `*-theme-dialog*.png`).

Checked by eye: every theme's text, secondary text, buttons, status chips and syntax are readable and visibly its own palette; Monaco, the tracker, the chart and the banner follow the theme; the silhouette avatar reads on every background; and nothing overflows at 375px. The gallery's own pages also moved: the deletion confirmation is now captured on Settings (`settings-delete-confirmation-*.png`), with a new `settings-*.png`.

## Inspection record: design polish, November 7, 2026

`VISUAL_PHASE=before pnpm visual:review --grep gallery` captured `before/`, then the full `pnpm visual:review` captured `after/` (24 passed). The landing page, puzzle list and signed-in Settings were also captured against a local site with the real puzzles, at 1440px and 375px in light and dark. That review found and fixed:

- The workspace's new Solved badge was taller than the chips beside it; it's now a chip with the status icon.
- A Settings `loading.tsx` made the forms re-mount after a save, dropping inline errors (caught by `e2e/settings.spec.ts`). It was removed.

Checked by eye: the landing screenshot in both themes with no sideways scroll at 375px, the list without a status column when signed out, sentence-case labels and the icon set on the list, workspace, profile and Settings, the profile without monospace names and dates, and the animated "Saved." confirmation.

## Actual checks

| Check | Result |
| --- | --- |
| `pnpm visual:review` | 24 passed (7 motion, 7 gallery, 10 themes); 56 gallery screenshots plus 52 under `themes/`; no unexpected browser errors or failed application requests |
| Web unit suite, throwaway database | 26 files, 1605 tests passed (950 of them theme checks) |
| Ingest unit suite, throwaway database | 516 passed; 2 existing platform skips |
| Content validation | All 136 puzzles passed |
| Ingest ruff, format and pyright | Passed; 44 Python files already formatted; no type errors |
| `pnpm e2e` | All 111 tests passed |
| Production build and `pnpm smoke` | Build passed; all 7 smoke tests passed |
| Web lint and typecheck | Both passed |

The table is the themes and settings pass's run; every suite ran one at a time. That pass also fixed a test that failed about one run in six on `main` too: the bounce test measured the animation's peak by seeking through it, then called `play()` from the end, which restarts a finished animation and recorded a second bounce. It now returns to where it was first. In the earlier motion pass, concurrent verification initially hit local timeouts. Running the unit and browser suites separately resolved the timing failures without increasing their timeouts. The first regression run also found expectations left over from the existing profile/wording work; those checks now target the current labels and solved-count elements. The history exhaustion expectation additionally verifies that the completed action retains focus.

## Limits

Browser coverage is headless Chromium on macOS. Native details fading and first-mount progress interpolation depend on modern CSS support; older browsers keep usable immediate final states. Screenshot activity dates are relative to the run's UTC day, so the calendar window advances over time. Real GitHub OAuth and hosted services are covered by their existing tests/manual launch setup, not real accounts in these screenshots. The IDE is reviewed at laptop size; a mobile IDE remains outside v1 scope.
