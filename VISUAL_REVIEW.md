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

Motion tests run separately and check actual animation starts and termination, one-time viewport reveals, reduced-motion durations/delays and left-anchored progress, absent JavaScript and a silent observer, rapid native group toggles, filter-pending feedback, navigation interruption, keyboard focus, progress changes without layout changes, history append position/focus, repeated cancellation, in-flight answer changes, duplicate submission prevention, solution tab focus and Monaco node identity. Request interception uses explicit gates, and animation readiness uses bounded state polling instead of long sleeps. Browser exceptions, console errors, failed requests (excluding normal navigation aborts) and failed application responses fail the review.

## Inspection record — November 6, 2026

The initial captures were reviewed, the following problems were corrected, and the final gallery was captured and inspected again:

- Shared keyframes were scoped incorrectly by CSS modules; custom-property names now refer to global keyframes. A mistyped `backward` fill value was corrected to the CSS keyword `backwards`.
- A completed/canceled animation could leave a `finished` promise pending. Review readiness now polls actual animation state with a five-second bound.
- Disabling the history button dropped keyboard focus. The stable button now uses `aria-disabled` and guards repeated requests.
- At 375px the signed-out button overlapped Profile despite zero document overflow. Compact visible sign-in labels preserve the full accessible name; the header can wrap when both sign-in methods are present. Pairwise header-rectangle checks cover this regression.
- Difficulty selection no longer changes the strip's height. Progress fills transform inside fixed tracks, with numeric values immediately readable.

Available early `before/` images are partial: the checkout's existing profile changes were still being completed during that capture. They are context, not approved pixel baselines. No changed image was automatically accepted.

## Actual checks

Results are finalized below after the last verification run.

## Limits

Browser coverage is headless Chromium on macOS. Native details fading and first-mount progress interpolation depend on modern CSS support; older browsers keep usable immediate final states. Screenshot activity dates are relative to the run's UTC day, so the calendar window advances over time. Real GitHub OAuth and hosted services are covered by their existing tests/manual launch setup, not real accounts in these screenshots. The IDE is reviewed at laptop size; a mobile IDE remains outside v1 scope.
