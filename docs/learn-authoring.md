# Authoring Learn lessons

The Learn path at `/learn` is a course in reading code. This guide covers adding or changing a lesson, keeping its answers private, testing it, and linking practice puzzles. The product rules are in `spec.md` section 10 ("Learn"); the validator's checks are in section 6 ("Lessons").

## Where things live

| What | Where |
|---|---|
| Order, groups, modules, references | `content/lessons/course.yaml`, the one source of ordering |
| One lesson, checkpoint or capstone | `content/lessons/<slug>.yaml` |
| The format | `content/schema/lesson.schema.json`, every field described |
| Validation and generation | `ingest/src/ingest/lessons.py`, run by `uv run python -m ingest learn` and `pnpm validate` |
| What the site reads | `web/lib/learn/course.generated.ts` (public) and `web/lib/server/learn/keys.generated.ts` (private). Both are generated; never edit them |

## Add a lesson

1. Pick a slug: the lesson's title in kebab case, without its number (`values-and-assignments`). A checkpoint is `c<n>-<title>`. **A slug never changes once published**: progress and links use it.
2. Add the slug to its module's `lessons` in `course.yaml`, in course order. A new group or module is a new entry there; no route or page code changes.
3. Write `content/lessons/<slug>.yaml`. Copy a lesson of the same kind and replace its content:
   - `code` is the human ID (`L07`, `C2`). `revision` starts at 1.
   - `prerequisites` are earlier slugs (suggestions only). `prerequisite_note` replaces the generated line, e.g. "C1 or equivalent".
   - `teach`, `objective`, `mistake`, `next`, `transfer`, `after` and every exercise `prompt` are Markdown. Write in US English, sentence case, plain words. No raw HTML or Mermaid; links are `https://` or site paths.
   - `code_blocks` are **original** teaching snippets, never copied from a snapshot. `example.blocks` shows blocks with the worked example; `example.walkthrough` is the worked explanation, which is public.
   - `exercises`: a lesson has one `required` exit check and usually one `practice` question; a checkpoint has three required items; the capstone four.
4. Run `cd ingest && uv run python -m ingest learn`. Fix whatever it reports, then commit the YAML and both generated files together.

## Exercise kinds

| `kind` | The learner | `key.answer` |
|---|---|---|
| `choice` | picks one of `choices` (2 to 6, each `{ id, label }`) | the right choice's `id` |
| `line` | selects one line of the code block named by `block` | its 1-based line number (blank lines can't be answers) |
| `sequence` | builds an ordered list from `candidates`, with keyboard add, move and remove | candidate ids in order, using at least one fewer than all of them |

Choice and candidate ids are stable, lowercase kebab-case, and shouldn't hint at the answer (`"8"`, `four-four-ten`, `service` are fine; `correct` isn't). Labels, explanations, hints and feedback are one line of text with only `` `code` `` and `**bold**`.

## Keep answers private

Everything under an exercise's `key` is private: `answer`, `explanation` (shown after a correct check or a reveal), `hints` (up to three, one at a time on request) and `feedback` (by wrong choice id). So is the capstone reflection's `rubric`. The generator moves them into `keys.generated.ts`, which imports `server-only`, so a page or client component that imported it would fail to build. The browser only gets them through `/api/learn/:slug/{check,hint,reveal,rubric}`, one at a time.

Don't put an answer in public text. A worked example teaches the method on a different input from the exit check. The e2e test `learn.spec.ts` scans every lesson page for any private string, and `web/tests/learn.test.ts` checks the public module has no key properties.

## Change a published lesson

Fix a typo in public prose without changing `revision`. **Bump `revision`** whenever an exercise, its choices, its candidates, a code block it selects from, or any key changes. Progress is stored per revision: a learner who completed revision 1 sees "Updated since you finished" and can check again, and the old completion stays. A page open on the old revision gets "This lesson was updated. Reload" from the server.

## Link practice puzzles

List existing puzzle ids under `practice`. They're recommendations, never a completion gate, and a lesson never explains their answer. The validator checks that each exists in `content/puzzles/` and that no public text names part of its answer: its symbol name or file, or a plain-word symbol name written as `` `code` ``. If it reports a clash with an ordinary word in prose, rephrase rather than override. The page shows only practice puzzles that are published where it's running. Never change a puzzle's snapshot, answer or score to fit a lesson.

`topics` (up to three, from the puzzle topic list) link to `/puzzles?tag=<topic>`.

## Test a check

1. `cd ingest && uv run python -m ingest learn`, then `uv run python -m pytest tests/test_lessons.py`.
2. `cd web && npx vitest run tests/learn.test.ts`: it grades every authored answer, and every choice, against its key.
3. Open the lesson with `pnpm local` (or `pnpm e2e learn.spec.ts`). Try a wrong answer, each hint, a reveal and the right answer, signed out and signed in.
4. **Review.** Every new or reworded check needs a fresh blind review: someone (or a separate agent) answers it from the public lesson alone, without seeing the YAML key. A disagreement means the prompt is ambiguous or the key is wrong. Fix the prompt; don't add a second accepted answer.

## Review checklist

- [ ] Every claim in the teaching and walkthrough is true of the language or protocol, and every toy policy is labeled as one.
- [ ] Each check has exactly one defensible answer on the information given.
- [ ] Feedback never names the answer.
- [ ] Code is original, short, and numbered as the learner sees it.
- [ ] The lesson reads at 375 px and works from the keyboard.
- [ ] `revision` is bumped if a check changed.
