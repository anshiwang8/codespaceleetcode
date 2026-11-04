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
import { topicLabel } from "@/lib/topics";

interface PromptPanelProps {
  puzzle: PuzzleDetail;
  status: PuzzleStatus;
  unlocked: boolean;
}

export function PromptPanel({ puzzle, status, unlocked }: PromptPanelProps) {
  const [hintsShown, setHintsShown] = useState(0);
  const noPersonChecked = puzzle.verifiedBy.every((name) => name.startsWith("agent:"));

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
            {topicLabel(tag)}
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

      {noPersonChecked ? (
        <p className={styles.unverified} data-testid="agent-only-note">
          No person has checked this puzzle yet. Its second solve was done by an automated agent.
        </p>
      ) : null}

      {unlocked ? <SolutionView slug={puzzle.slug} /> : null}
    </section>
  );
}
