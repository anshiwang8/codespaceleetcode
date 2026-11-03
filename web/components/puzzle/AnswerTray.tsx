"use client";

import { useEffect, useRef, useState } from "react";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import styles from "@/components/puzzle/puzzle.module.css";
import type { PuzzleDetail, SubmitResponse } from "@/lib/api-types";
import { type Draft, type DraftAction, isReadyToSubmit, type SequenceItem } from "@/lib/client/answer";

const INSTRUCTIONS: Record<Draft["kind"], string> = {
  symbol: "Put the cursor on a symbol and choose Select as answer below the editor, or use + on an outline row.",
  file: "Use + on a file in the tree, or Select as answer below the editor for the open file.",
  location: "Select lines in the editor, then choose Select as answer below the editor.",
  sequence:
    "Add symbols in order: put the cursor on one and choose Add to sequence, or use + on an outline row. Drag or use the arrows to reorder.",
  set: "Use + on files in the tree and symbols in the outline, or the buttons below the editor.",
  choice: "Pick one of the options.",
};

interface AnswerTrayProps {
  puzzle: PuzzleDetail;
  draft: Draft;
  pick: (action: DraftAction) => void;
  onSubmit: () => void;
  submitting: boolean;
  /** True until the page knows who is signed in. A result is tied to that person. */
  waitingForAuth: boolean;
  submitError: string | null;
  result: SubmitResponse | null;
  attempts: number;
  signInReason: string | null;
  signedIn: boolean;
}

export function AnswerTray({
  puzzle,
  draft,
  pick,
  onSubmit,
  submitting,
  waitingForAuth,
  submitError,
  result,
  attempts,
  signInReason,
  signedIn,
}: AnswerTrayProps) {
  const ready = isReadyToSubmit(draft, puzzle.setCount);
  return (
    <section className={styles.tray} aria-label="Answer tray" data-testid="answer-tray">
      <h2 className={styles.trayHeading}>Answer</h2>
      <p className={styles.trayInstructions} data-testid="tray-instructions">
        {INSTRUCTIONS[draft.kind]}
      </p>
      <TraySelection puzzle={puzzle} draft={draft} pick={pick} />

      <div className={styles.submitRow}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready || submitting || waitingForAuth}
          onClick={onSubmit}
          data-testid="submit"
        >
          {submitting ? "Submitting…" : "Submit answer"}
        </button>
        <span className="muted" data-testid="attempts">
          {attempts === 1 ? "1 attempt" : `${attempts} attempts`}
        </span>
      </div>

      {signInReason && !signedIn ? <SignInPrompt reason={signInReason} /> : null}

      {submitError ? (
        <p className="notice notice-error" role="alert" data-testid="submit-error">
          {submitError}
        </p>
      ) : null}

      <div aria-live="polite">
        {result ? (
          <div
            className={result.correct ? styles.resultCorrect : styles.resultIncorrect}
            data-testid="result"
            data-correct={result.correct}
          >
            <strong>{result.correct ? "Correct" : "Incorrect"}</strong>
            <span>
              {result.attempts === 1 ? "Attempt 1" : `Attempt ${result.attempts}`}
              {result.correct ? ". The solution is in the left panel." : null}
              {result.correct ? null : ". Change your answer and try again."}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AnswerId({ id, onRemove }: { id: string; onRemove?: () => void }) {
  return (
    <div className={styles.answerRow}>
      <code className={styles.answerId} data-testid="selected-answer">
        {id}
      </code>
      {onRemove ? (
        <button
          type="button"
          className="btn btn-small btn-quiet"
          aria-label={`Remove ${id}`}
          onClick={onRemove}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

function TraySelection({
  puzzle,
  draft,
  pick,
}: {
  puzzle: PuzzleDetail;
  draft: Draft;
  pick: (action: DraftAction) => void;
}) {
  switch (draft.kind) {
    case "symbol":
      return draft.id ? (
        <AnswerId id={draft.id} onRemove={() => pick({ type: "clear" })} />
      ) : (
        <NothingYet text="No symbol selected yet." />
      );
    case "file":
      return draft.path ? (
        <AnswerId id={draft.path} onRemove={() => pick({ type: "clear" })} />
      ) : (
        <NothingYet text="No file selected yet." />
      );
    case "location":
      return draft.id ? (
        <AnswerId id={draft.id} onRemove={() => pick({ type: "clear" })} />
      ) : (
        <NothingYet text="No lines selected yet." />
      );
    case "sequence":
      return <SequenceList items={draft.items} pick={pick} />;
    case "set":
      return (
        <>
          <p className={styles.setCount} data-testid="set-count">
            {draft.ids.length} of {puzzle.setCount ?? "?"} selected
          </p>
          {draft.ids.length === 0 ? <NothingYet text="Nothing selected yet." /> : null}
          <ul className={styles.answerList}>
            {draft.ids.map((id) => (
              <li key={id}>
                <AnswerId id={id} onRemove={() => pick({ type: "remove", id })} />
              </li>
            ))}
          </ul>
        </>
      );
    case "choice":
      return (
        <fieldset className={styles.choices}>
          <legend className="visually-hidden">Options</legend>
          {(puzzle.choices ?? []).map((choice) => (
            <label key={choice.id} className={styles.choice}>
              <input
                type="radio"
                name="choice"
                value={choice.id}
                checked={draft.option === choice.id}
                onChange={() => pick({ type: "pick-choice", option: choice.id })}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </fieldset>
      );
  }
}

function NothingYet({ text }: { text: string }) {
  return (
    <p className={styles.nothingYet} data-testid="tray-empty">
      {text}
    </p>
  );
}

function SequenceList({ items, pick }: { items: SequenceItem[]; pick: (action: DraftAction) => void }) {
  const [dragKey, setDragKey] = useState<number | null>(null);
  const [overKey, setOverKey] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const focusAfterMove = useRef<{ key: number; direction: "up" | "down" } | null>(null);

  // React moves DOM nodes on reorder, and a moved node loses focus. Put it back, on the other arrow
  // when this one has just become disabled at the end of the list.
  useEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    const button = (direction: string) =>
      listRef.current?.querySelector<HTMLButtonElement>(`[data-move="${target.key}:${direction}"]`);
    const preferred = button(target.direction);
    const other = button(target.direction === "up" ? "down" : "up");
    (preferred && !preferred.disabled ? preferred : other)?.focus();
  }, [items]);

  if (items.length === 0) return <NothingYet text="No symbols added yet." />;

  const move = (item: SequenceItem, to: number, direction: "up" | "down") => {
    focusAfterMove.current = { key: item.key, direction };
    pick({ type: "move", key: item.key, to });
    setAnnouncement(`Moved ${item.id} to position ${to + 1} of ${items.length}.`);
  };

  return (
    <>
      <ol ref={listRef} className={styles.sequence} data-testid="sequence-list">
        {items.map((item, index) => (
          <li
            key={item.key}
            draggable
            className={`${styles.sequenceItem} ${overKey === item.key && dragKey !== item.key ? styles.sequenceOver : ""}`}
            data-testid="sequence-item"
            onDragStart={(event) => {
              setDragKey(item.key);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setOverKey(item.key);
            }}
            onDragLeave={() => setOverKey((current) => (current === item.key ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              if (dragKey !== null && dragKey !== item.key) {
                pick({ type: "move", key: dragKey, to: index });
                setAnnouncement(`Moved to position ${index + 1} of ${items.length}.`);
              }
              setDragKey(null);
              setOverKey(null);
            }}
            onDragEnd={() => {
              setDragKey(null);
              setOverKey(null);
            }}
          >
            <span className={styles.sequenceIndex} aria-hidden="true">
              {index + 1}
            </span>
            <code className={styles.answerId}>{item.id}</code>
            <span className={styles.sequenceButtons}>
              <button
                type="button"
                className="btn btn-small btn-quiet"
                aria-label={`Move ${item.id} up`}
                data-move={`${item.key}:up`}
                disabled={index === 0}
                onClick={() => move(item, index - 1, "up")}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-small btn-quiet"
                aria-label={`Move ${item.id} down`}
                data-move={`${item.key}:down`}
                disabled={index === items.length - 1}
                onClick={() => move(item, index + 1, "down")}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-small btn-quiet"
                aria-label={`Remove ${item.id}`}
                onClick={() => pick({ type: "remove-item", key: item.key })}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </>
  );
}
