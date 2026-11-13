"use client";

import Link from "next/link";
import { useId, useState } from "react";
import styles from "@/components/learn/learn.module.css";
import { InlineText } from "@/components/learn/InlineText";
import { Icon } from "@/components/site/Icon";
import { ApiRequestError, api } from "@/lib/client/api";
import { recordCheck, useLearnProgress } from "@/lib/client/learn-progress";
import { codeLines } from "@/lib/learn/code";
import type { CodeBlock, LearnAnswer, PublicExercise } from "@/lib/learn/types";

interface ExerciseProps {
  slug: string;
  revision: number;
  requiredIds: string[];
  exercise: PublicExercise;
  /** The prompt, already rendered on the server. */
  prompt: React.ReactNode;
  /** kind "line": the block whose lines are choices. */
  block?: CodeBlock;
  /** After a miss: the lesson to revisit. */
  review?: { href: string; title: string };
}

type Result =
  | { kind: "correct"; explanation: string }
  | { kind: "wrong"; feedback: string }
  | { kind: "stale"; message: string }
  | { kind: "error"; message: string };

function sameAnswer(a: LearnAnswer, b: LearnAnswer): boolean {
  if (a.kind === "choice" && b.kind === "choice") return a.choiceId === b.choiceId;
  if (a.kind === "line" && b.kind === "line") return a.line === b.line;
  if (a.kind === "sequence" && b.kind === "sequence") return a.steps.join(",") === b.steps.join(",");
  return false;
}

/**
 * One check. The learner chooses (a choice, a line, or an ordered trace), and the server grades
 * it: the browser never holds the key. Hints come one at a time on request. "Show the answer"
 * reveals the answer and explanation but doesn't complete anything; checking still does.
 */
export function Exercise({ slug, revision, requiredIds, exercise, prompt, block, review }: ExerciseProps) {
  const progress = useLearnProgress();
  const name = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState<"check" | "hint" | "reveal" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<{ answer: LearnAnswer; explanation: string } | null>(null);

  const answer: LearnAnswer | null =
    exercise.kind === "choice"
      ? choice === null
        ? null
        : { kind: "choice", choiceId: choice }
      : exercise.kind === "line"
        ? line === null
          ? null
          : { kind: "line", line }
        : steps.length === 0
          ? null
          : { kind: "sequence", steps };

  const changed = () => {
    if (result?.kind === "wrong" || result?.kind === "correct" || result?.kind === "error") setResult(null);
  };

  const failure = (error: unknown): Result =>
    error instanceof ApiRequestError && error.status === 409
      ? { kind: "stale", message: error.message }
      : { kind: "error", message: error instanceof ApiRequestError ? error.message : "Something went wrong. Try again." };

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!answer || busy) return;
    const owner = progress.owner;
    setBusy("check");
    try {
      const response = await api.learnCheck(slug, revision, exercise.id, answer);
      if (response.correct) {
        setResult({ kind: "correct", explanation: response.explanation ?? "" });
        recordCheck(owner, slug, revision, requiredIds, exercise.id, response.progress);
      } else {
        setResult({ kind: "wrong", feedback: response.feedback ?? "Not quite. Try again." });
      }
    } catch (error) {
      setResult(failure(error));
    } finally {
      setBusy(null);
    }
  }

  async function nextHint() {
    if (busy) return;
    setBusy("hint");
    try {
      const response = await api.learnHint(slug, revision, exercise.id, hints.length + 1);
      setHints((current) => (current.length < response.level ? [...current, response.hint] : current));
    } catch (error) {
      setResult(failure(error));
    } finally {
      setBusy(null);
    }
  }

  async function reveal() {
    if (busy) return;
    setBusy("reveal");
    try {
      setRevealed(await api.learnReveal(slug, revision, exercise.id));
    } catch (error) {
      setResult(failure(error));
    } finally {
      setBusy(null);
    }
  }

  const choiceLabel = (id: string) => exercise.choices?.find((item) => item.id === id)?.label ?? id;
  const stepLabel = (id: string) => exercise.candidates?.find((item) => item.id === id)?.label ?? id;
  const lines = block ? codeLines(block.source) : [];
  const required = exercise.role === "required";
  const legendId = `${name}-legend`;

  return (
    <section
      className={`${styles.exercise} ${required ? styles.required : ""}`}
      aria-labelledby={legendId}
      data-testid={`exercise-${exercise.id}`}
      data-state={result?.kind ?? "idle"}
    >
      <form onSubmit={(event) => void check(event)}>
        <div className={styles.exerciseHead}>
          <h3 id={legendId} className={styles.exerciseTitle}>
            {exercise.label ?? (required ? "Check" : "Practice")}
          </h3>
          <span className={styles.exerciseRole}>{required ? "Counts toward completion" : "Practice, not scored"}</span>
        </div>
        <div className={styles.exercisePrompt}>{prompt}</div>

        {exercise.kind === "choice" ? (
          <fieldset className={styles.choices}>
            <legend className="visually-hidden">Choose one answer</legend>
            {exercise.choices?.map((item) => (
              <label key={item.id} className={styles.choice} data-selected={choice === item.id || undefined}>
                <input
                  type="radio"
                  name={name}
                  value={item.id}
                  checked={choice === item.id}
                  onChange={() => {
                    setChoice(item.id);
                    changed();
                  }}
                  data-testid={`choice-${item.id}`}
                />
                <span>
                  <InlineText text={item.label} />
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {exercise.kind === "line" && block ? (
          <fieldset className={styles.lineChoices}>
            <legend className={styles.lineLegend}>
              {block.file ? <span className={styles.codeFile}>{block.file}</span> : null} Select one line
            </legend>
            {lines.map((text, index) => {
              const number = index + 1;
              if (text.trim() === "") {
                return (
                  <div key={number} className={styles.lineBlank} aria-hidden="true">
                    <span className={styles.lineNumber}>{number}</span>
                  </div>
                );
              }
              return (
                <label key={number} className={styles.lineChoice} data-selected={line === number || undefined}>
                  <input
                    type="radio"
                    name={name}
                    value={number}
                    checked={line === number}
                    onChange={() => {
                      setLine(number);
                      changed();
                    }}
                    aria-label={`Line ${number}: ${text.trim()}`}
                    data-testid={`line-${number}`}
                  />
                  <span className={styles.lineNumber} aria-hidden="true">
                    {number}
                  </span>
                  <code className={styles.lineText}>{text}</code>
                </label>
              );
            })}
          </fieldset>
        ) : null}

        {exercise.kind === "sequence" ? (
          <div className={styles.sequence}>
            <div>
              <h4 className={styles.sequenceHeading} id={`${name}-trace`}>
                Your sequence
              </h4>
              {steps.length === 0 ? (
                <p className={styles.sequenceEmpty}>Add steps from the list, in the order they happen.</p>
              ) : (
                <ol className={styles.sequenceList} aria-labelledby={`${name}-trace`} data-testid="sequence-answer">
                  {steps.map((step, index) => (
                    <li key={step} className={styles.sequenceStep}>
                      <span className={styles.stepText}>
                        <InlineText text={stepLabel(step)} />
                      </span>
                      <span className={styles.stepButtons}>
                        <button
                          type="button"
                          className="btn btn-small btn-quiet"
                          disabled={index === 0}
                          aria-label={`Move ${stepLabel(step).replaceAll("`", "")} earlier`}
                          onClick={() => {
                            setSteps((current) => {
                              const next = [...current];
                              [next[index - 1], next[index]] = [next[index] as string, next[index - 1] as string];
                              return next;
                            });
                            changed();
                          }}
                        >
                          <Icon name="arrow-up" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-small btn-quiet"
                          disabled={index === steps.length - 1}
                          aria-label={`Move ${stepLabel(step).replaceAll("`", "")} later`}
                          onClick={() => {
                            setSteps((current) => {
                              const next = [...current];
                              [next[index], next[index + 1]] = [next[index + 1] as string, next[index] as string];
                              return next;
                            });
                            changed();
                          }}
                        >
                          <Icon name="arrow-down" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-small btn-quiet"
                          aria-label={`Remove ${stepLabel(step).replaceAll("`", "")}`}
                          onClick={() => {
                            setSteps((current) => current.filter((item) => item !== step));
                            changed();
                          }}
                        >
                          <Icon name="x" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h4 className={styles.sequenceHeading}>Steps</h4>
              <ul className={styles.candidateList}>
                {exercise.candidates?.map((candidate) => {
                  const used = steps.includes(candidate.id);
                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={used}
                        onClick={() => {
                          setSteps((current) => [...current, candidate.id]);
                          changed();
                        }}
                        data-testid={`add-${candidate.id}`}
                      >
                        <Icon name="plus" />
                        <span>
                          <InlineText text={candidate.label} />
                        </span>
                        {used ? <span className="visually-hidden"> (added)</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : null}

        <div className={styles.exerciseActions}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!answer || busy !== null}
            aria-busy={busy === "check"}
            data-testid="check"
          >
            Check
          </button>
          {exercise.hintCount > hints.length ? (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => void nextHint()}
              disabled={busy !== null}
              aria-busy={busy === "hint"}
              data-testid="hint"
            >
              <Icon name="lightbulb" />
              {exercise.hintCount > 1 ? `Hint ${hints.length + 1} of ${exercise.hintCount}` : "Show a hint"}
            </button>
          ) : null}
          {revealed ? null : (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => void reveal()}
              disabled={busy !== null}
              aria-busy={busy === "reveal"}
              data-testid="reveal"
            >
              Show the answer
            </button>
          )}
        </div>
      </form>

      {hints.length > 0 ? (
        <ol className={styles.hints} aria-label="Hints" data-testid="hints">
          {hints.map((hint, index) => (
            <li key={index}>
              <InlineText text={hint} />
            </li>
          ))}
        </ol>
      ) : null}

      <div role="status" aria-live="polite" className={styles.resultSlot}>
        {result?.kind === "correct" ? (
          <div className={`${styles.result} ${styles.resultOk}`} data-testid="result-correct">
            <p className={styles.resultHead}>
              <Icon name="check" /> Correct.
              {required ? " This counts toward completing the lesson." : ""}
            </p>
            <p>
              <InlineText text={result.explanation} />
            </p>
          </div>
        ) : null}
        {result?.kind === "wrong" ? (
          <div className={`${styles.result} ${styles.resultBad}`} data-testid="result-wrong">
            <p className={styles.resultHead}>
              <Icon name="x" /> Not yet.
            </p>
            <p>
              <InlineText text={result.feedback} />
            </p>
            <p className={styles.resultNext}>
              Change your answer and check again{exercise.hintCount > hints.length ? ", or ask for a hint" : ""}.
              {review ? (
                <>
                  {" "}
                  To review, see <Link href={review.href}>{review.title}</Link>.
                </>
              ) : null}
            </p>
          </div>
        ) : null}
        {result?.kind === "stale" ? (
          <div className="notice notice-error" data-testid="result-stale">
            <p>{result.message}</p>
            <button type="button" className="btn btn-small" onClick={() => window.location.reload()}>
              Reload the lesson
            </button>
          </div>
        ) : null}
        {result?.kind === "error" ? (
          <p className="notice notice-error" data-testid="result-error">
            {result.message}
          </p>
        ) : null}
      </div>

      {revealed ? (
        <div className={styles.revealed} data-testid="revealed">
          <p className={styles.resultHead}>
            Answer:{" "}
            {revealed.answer.kind === "choice" ? (
              <InlineText text={choiceLabel(revealed.answer.choiceId)} />
            ) : revealed.answer.kind === "line" ? (
              <>
                line {revealed.answer.line}
                {lines[revealed.answer.line - 1] ? (
                  <>
                    , <code>{lines[revealed.answer.line - 1]?.trim()}</code>
                  </>
                ) : null}
              </>
            ) : (
              revealed.answer.steps.map((step, index) => (
                <span key={step}>
                  {index > 0 ? " → " : ""}
                  <InlineText text={stepLabel(step)} />
                </span>
              ))
            )}
          </p>
          <p>
            <InlineText text={revealed.explanation} />
          </p>
          {required && !(result?.kind === "correct" && answer && sameAnswer(answer, revealed.answer)) ? (
            <p className={styles.resultNext}>Showing the answer doesn&apos;t complete the lesson. Select it and check to finish.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
