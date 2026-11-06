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
| Landing; default, filtered and empty puzzle list | 375×900, 768×900, 1440×900 |
| Signed-out, new-user, populated/long-login profiles; deletion confirmation | 375×900, 768×900, 1440×900 |
| Workspace locked solution, selected choice, incorrect/correct feedback, unlocked solution | 1366×800 |

The 29 screenshots retain motion and wait for explicit route content, hydrated account controls, fonts and no running/pending animations. Landing sections are scrolled into view once before full-page capture. History uses stable synthetic UTC activity and deterministic fixture names. The gallery checks document overflow and intersecting header control rectangles. Deletion is never submitted by screenshot tests. Only public fixture choices appear in workspace screenshots; the unlocked solution body is masked.

Motion tests run separately and check actual animation starts and termination, one-time viewport reveals, reduced-motion durations/delays and left-anchored progress, absent JavaScript and a silent observer, rapid native group toggles, filter-pending feedback, navigation interruption, keyboard focus, progress changes without layout changes, history append position/focus, repeated cancellation, in-flight answer changes, duplicate submission prevention, solution tab focus, Monaco node identity, and the correct-result bounce (it starts, plays once, peaks between 1.1 and 1.3 scale, ends at rest, leaves the result box and View solution button unmoved, doesn't play for a wrong result, and has no duration under reduced motion). Request interception uses explicit gates, and animation readiness uses bounded state polling instead of long sleeps. Browser exceptions, console errors, failed requests (excluding normal navigation aborts) and failed application responses fail gallery/representative motion checks. A separate pending-button test explicitly expects and asserts a simulated provider refusal.

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

## Actual checks

| Check | Result |
| --- | --- |
| `pnpm visual:review` | 10 passed (6 motion, 4 gallery); 29 final-state screenshots; no unexpected browser errors or failed application requests |
| Web unit suite, throwaway database | 20 files, 592 tests passed |
| Ingest unit suite, throwaway database | 516 passed; 2 existing platform skips |
| Content validation | All 136 puzzles passed |
| Ingest ruff, format and pyright | Passed; 44 Python files already formatted; no type errors |
| `pnpm e2e` | All 95 tests passed |
| Production build and `pnpm smoke` | Build passed; all 7 smoke tests passed |
| Web lint and typecheck | Both passed |

The table is this pass's run; every suite ran one at a time. In the earlier motion pass, concurrent verification initially hit local timeouts. Running the unit and browser suites separately resolved the timing failures without increasing their timeouts. The first regression run also found expectations left over from the existing profile/wording work; those checks now target the current labels and solved-count elements. The history exhaustion expectation additionally verifies that the completed action retains focus.

## Limits

Browser coverage is headless Chromium on macOS. Native details fading and first-mount progress interpolation depend on modern CSS support; older browsers keep usable immediate final states. Screenshot activity dates are relative to the run's UTC day, so the calendar window advances over time. Real GitHub OAuth and hosted services are covered by their existing tests/manual launch setup, not real accounts in these screenshots. The IDE is reviewed at laptop size; a mobile IDE remains outside v1 scope.
