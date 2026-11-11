"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import styles from "@/components/puzzle/hints.module.css";
import { Markdown } from "@/components/puzzle/Markdown";
import { Icon } from "@/components/site/Icon";
import type { HintRevealResponse, PuzzleDetail, PuzzleStatus } from "@/lib/api-types";
import { formatNumber, plural } from "@/lib/format";
import { SCORING } from "@/lib/scoring";

/** What each level is for, when a puzzle has more than one. A single hint is just "Hint". */
const LEVEL_NAMES = ["Direction", "Narrow the search", "Guided reasoning"] as const;

export function hintLabel(level: number, hintCount: number): { level: string | null; name: string } {
  if (hintCount <= 1) return { level: null, name: "Hint" };
  return { level: `Level ${level}`, name: LEVEL_NAMES[level - 1] ?? `Hint ${level}` };
}

/** What went wrong, and what to do about it. Never the server's raw text for unexpected cases. */
function revealErrorMessage(status: number): string {
  switch (status) {
    case 0:
      return "Couldn't reach the server. Check your connection, then try again.";
    case 401:
      return "You're signed out. Sign in again to reveal hints.";
    case 404:
      return "This puzzle isn't available anymore. Go back to the puzzle list.";
    case 409:
      return "An earlier hint isn't revealed yet. Reload the page, then try again.";
    case 429:
      return "Too many hints requested in a short time. Wait a minute, then try again.";
    default:
      return "The hint couldn't be revealed. Try again.";
  }
}

class RevealError extends Error {
  constructor(readonly status: number) {
    super(revealErrorMessage(status));
  }
}

async function requestHint(slug: string, level: number, signal: AbortSignal): Promise<HintRevealResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/puzzles/${encodeURIComponent(slug)}/hints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
      signal,
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new RevealError(0);
  }
  if (!response.ok) throw new RevealError(response.status);
  return (await response.json()) as HintRevealResponse;
}

interface HintPanelProps {
  puzzle: PuzzleDetail;
  status: PuzzleStatus;
}

/**
 * The Description tab's hints: revealed one level at a time, each recorded on the server before its
 * text arrives (web/lib/server/hints.ts). Unrevealed text never reaches the page.
 */
export function HintPanel({ puzzle, status }: HintPanelProps) {
  const headingId = useId();
  const { me } = useAuth();
  const login = me?.user?.login ?? null;
  const signedOut = me !== null && me.user === null;

  // Newer than the page's props until the next refresh, and tied to whoever revealed them, so
  // signing in as someone else falls back to the props the server re-rendered for that person.
  const [local, setLocal] = useState<{ login: string; hintCount: number; hints: string[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [newLevel, setNewLevel] = useState<number | null>(null);

  const request = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const focusLevel = useRef<number | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const ownLocal = local && local.login === login ? local : null;
  const hintCount = ownLocal?.hintCount ?? puzzle.hintCount;
  // The longer list wins: a refresh can bring the server's copy level with, or past, this one.
  const revealed =
    ownLocal && ownLocal.hints.length >= puzzle.revealedHints.length ? ownLocal.hints : puzzle.revealedHints;
  const nextLevel = revealed.length + 1;
  const remaining = Math.max(0, hintCount - revealed.length);
  const solved = status === "solved";

  // Keyboard users land on the hint they asked for. The reveal button may be gone by then.
  useEffect(() => {
    const level = focusLevel.current;
    if (level === null) return;
    focusLevel.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-level="${level}"]`)?.focus();
  }, [revealed]);

  if (hintCount <= 0) return null;

  const reveal = async () => {
    if (request.current || !login || remaining === 0) return;
    const controller = new AbortController();
    const level = nextLevel;
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const response = await requestHint(puzzle.slug, level, controller.signal);
      if (controller.signal.aborted) return;
      focusLevel.current = level;
      setNewLevel(level);
      setLocal({ login, hintCount: response.hintCount, hints: response.revealedHints });
      setAnnouncement(
        `Hint ${formatNumber(level)} of ${formatNumber(response.hintCount)} revealed: ${hintLabel(level, response.hintCount).name}.`,
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof RevealError ? cause.message : revealErrorMessage(-1));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };

  const countText = signedOut
    ? plural(hintCount, "hint", "hints")
    : `${formatNumber(revealed.length)} of ${plural(hintCount, "hint", "hints")} revealed`;

  return (
    <section className={styles.hints} aria-labelledby={headingId} data-testid="hints">
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          <Icon name="lightbulb" className={styles.headingIcon} />
          Hints
        </h2>
        <span className={styles.count} data-testid="hint-count">
          {signedOut ? null : (
            <span className={styles.pips} aria-hidden="true">
              {Array.from({ length: hintCount }, (_, index) => (
                <span key={index} className={index < revealed.length ? styles.pipOn : styles.pip} />
              ))}
            </span>
          )}
          {countText}
        </span>
      </div>

      {signedOut ? (
        <SignInPrompt reason="Sign in to reveal hints. Revealed hints are saved to your account." />
      ) : (
        <>
          {revealed.length > 0 ? (
            <ol ref={listRef} className={styles.list}>
              {revealed.map((hint, index) => {
                const level = index + 1;
                const label = hintLabel(level, hintCount);
                return (
                  <li
                    key={level}
                    className={level === newLevel ? `${styles.hint} ${styles.hintNew}` : styles.hint}
                    tabIndex={-1}
                    data-level={level}
                    data-testid="hint"
                  >
                    <p className={styles.label} data-testid="hint-label">
                      {label.level ? <span className={styles.level}>{label.level}</span> : null}
                      {label.level ? " " : null}
                      <span className={styles.name}>{label.name}</span>
                    </p>
                    <Markdown source={hint} className={styles.body} />
                  </li>
                );
              })}
            </ol>
          ) : null}

          {solved ? (
            <p className={styles.note} data-testid="hint-cost">
              You&apos;ve solved this puzzle, so hints no longer affect its score.
            </p>
          ) : remaining > 0 ? (
            <p className={styles.note} data-testid="hint-cost">
              Each hint revealed before you solve takes {formatNumber(SCORING.hintPenalty)} points off this
              puzzle&apos;s score.
            </p>
          ) : null}

          {remaining > 0 ? (
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-small pending-track"
                aria-busy={pending}
                disabled={pending || me === null}
                onClick={() => void reveal()}
                data-testid="reveal-hint"
              >
                {/* The label stays put while pending, so the button doesn't change size under the pointer. */}
                {hintCount === 1 ? "Reveal hint" : `Reveal hint ${formatNumber(nextLevel)}`}
              </button>
            </div>
          ) : null}

          {error ? (
            <p className={`notice notice-error ${styles.error}`} role="alert" data-testid="hint-error">
              {error}
            </p>
          ) : null}

        </>
      )}

      <p className="visually-hidden" role="status" aria-live="polite" data-testid="hint-announcement">
        {announcement}
      </p>
    </section>
  );
}
