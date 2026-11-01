"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { SolutionView } from "@/components/puzzle/SolutionView";
import styles from "@/components/puzzle/puzzle.module.css";
import type { PuzzleDetail, PuzzleStatus } from "@/lib/api-types";
import {
  answerKindInWords,
  DIFFICULTY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/client/labels";

interface PromptPanelProps {
  puzzle: PuzzleDetail;
  status: PuzzleStatus;
  attempts: number;
  unlocked: boolean;
  /** Resolves to an error message, or null if it went through or needs a sign-in first. */
  onGiveUp: () => Promise<string | null>;
}

export function PromptPanel({ puzzle, status, attempts, unlocked, onGiveUp }: PromptPanelProps) {
  const [hintsShown, setHintsShown] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [givingUp, setGivingUp] = useState(false);
  const [giveUpError, setGiveUpError] = useState<string | null>(null);

  const finished = status === "solved" || status === "given_up";
  const noPersonChecked = puzzle.verifiedBy.every((name) => name.startsWith("agent:"));

  const confirmGiveUp = async () => {
    setGivingUp(true);
    setGiveUpError(await onGiveUp());
    setGivingUp(false);
    setConfirming(false);
  };

  return (
    <section className={styles.promptPanel} aria-label="Puzzle">
      <h1 className={styles.puzzleTitle}>{puzzle.title}</h1>
      <div className={styles.metaRow}>
        <span className="chip">{TYPE_LABELS[puzzle.type]}</span>
        <span className={`chip difficulty-${puzzle.difficulty}`}>
          {DIFFICULTY_LABELS[puzzle.difficulty]}
        </span>
        <span className={`chip status-${status}`} data-testid="puzzle-status">
          {STATUS_LABELS[status]}
        </span>
        {puzzle.tags.map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>

      <div className={styles.markdown} data-testid="prompt">
        <ReactMarkdown skipHtml>{puzzle.prompt}</ReactMarkdown>
      </div>

      <div className={styles.block}>
        <h2>Your answer</h2>
        <p data-testid="answer-kind">{answerKindInWords(puzzle.answerKind, puzzle.setCount)}</p>
      </div>

      {puzzle.hints.length > 0 ? (
        <div className={styles.block}>
          <h2>
            Hints <span className="muted">({hintsShown} of {puzzle.hints.length})</span>
          </h2>
          {hintsShown > 0 ? (
            <ol className={styles.hints}>
              {puzzle.hints.slice(0, hintsShown).map((hint, index) => (
                <li key={index} className={styles.markdown} data-testid="hint">
                  <ReactMarkdown skipHtml>{hint}</ReactMarkdown>
                </li>
              ))}
            </ol>
          ) : null}
          {hintsShown < puzzle.hints.length ? (
            <button type="button" className="btn btn-small" onClick={() => setHintsShown(hintsShown + 1)}>
              {hintsShown === 0 ? "Show a hint" : "Show the next hint"}
            </button>
          ) : null}
        </div>
      ) : null}

      {finished ? null : (
        <div className={styles.block}>
          {confirming ? (
            <div className={styles.confirm} role="group" aria-label="Confirm giving up">
              <p>Give up and see the solution? This puzzle won&apos;t count as solved.</p>
              <div className={styles.confirmButtons}>
                <button
                  type="button"
                  className="btn"
                  disabled={givingUp}
                  onClick={() => void confirmGiveUp()}
                >
                  Yes, give up
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={givingUp}
                  onClick={() => setConfirming(false)}
                >
                  Keep trying
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setConfirming(true)}>
              Give up
            </button>
          )}
          {giveUpError ? (
            <p className="notice notice-error" role="alert" style={{ marginTop: 6 }}>
              {giveUpError}
            </p>
          ) : null}
        </div>
      )}

      {noPersonChecked ? (
        <p className={styles.unverified} data-testid="agent-only-note">
          No person has checked this puzzle yet. Its second solve was done by an automated agent.
        </p>
      ) : null}

      {status === "given_up" && attempts > 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          You gave up on this one, so later answers are graded but it stays unsolved.
        </p>
      ) : null}

      {unlocked ? <SolutionView slug={puzzle.slug} /> : null}
    </section>
  );
}
