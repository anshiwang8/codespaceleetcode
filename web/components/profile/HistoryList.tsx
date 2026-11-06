"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/profile/profile.module.css";
import type { HistoryEntry, HistoryPage } from "@/lib/api-types";
import { PUZZLES_PATH } from "@/lib/browse";
import { ApiRequestError, api } from "@/lib/client/api";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { formatDateTime } from "@/lib/format";

/** Recent submissions, newest first. "Load more" fetches the next page from /api/me/history. */
export function HistoryList({ initial }: { initial: HistoryPage }) {
  const [entries, setEntries] = useState<HistoryEntry[]>(initial.entries);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useRef<AbortController | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => () => request.current?.abort(), []);

  async function loadMore() {
    if (!cursor || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const page = await api.history(cursor, controller.signal);
      if (controller.signal.aborted) return;
      setAnnouncement(`${page.entries.length} older submissions loaded.`);
      setEntries((shown) => {
        // A page can repeat nothing, since the cursor only moves back in time, but stay safe.
        const seen = new Set(shown.map((entry) => entry.id));
        return [...shown, ...page.entries.filter((entry) => !seen.has(entry.id))];
      });
      setCursor(page.nextCursor);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof ApiRequestError && caught.status === 401
          ? "You've been signed out. Sign in again to see more."
          : "Couldn't load more submissions. Try again.",
      );
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className={`card ${styles.history}`} aria-labelledby="history-heading" data-testid="history">
      <div className={styles.sectionHeader}>
        <h2 id="history-heading" className="section-title">
          Recent submissions
        </h2>
        <p className={styles.sectionNote}>Every graded answer, newest first. Times are in UTC.</p>
      </div>
      {entries.length === 0 ? (
        <div className="empty" data-testid="history-empty">
          <strong>No submissions yet.</strong>
          <span>Your answers show up here once you submit one.</span>
          <Link href={PUZZLES_PATH} className="btn btn-small">
            Find a puzzle
          </Link>
        </div>
      ) : (
        <ol className={styles.historyList}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.historyItem} data-testid="history-entry">
              <span className={`badge ${entry.passed ? "badge-ok" : "badge-bad"} ${styles.historyResult}`}>
                <span aria-hidden="true">{entry.passed ? "✓" : "✗"}</span>
                {entry.passed ? "Correct" : "Incorrect"}
              </span>
              <span className={styles.historyMain}>
                <Link href={`/puzzles/${entry.slug}`} className={styles.historyTitle}>
                  {entry.title}
                </Link>
                <span className={styles.historyMeta}>
                  <span className="mono">{entry.repoSlug}</span>
                  <span aria-hidden="true"> · </span>
                  {TYPE_LABELS[entry.type]}
                  <span aria-hidden="true"> · </span>
                  <span className={`difficulty-${entry.difficulty}`}>{DIFFICULTY_LABELS[entry.difficulty]}</span>
                </span>
              </span>
              <time className={styles.historyTime} dateTime={entry.submittedAt}>
                {formatDateTime(entry.submittedAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}
      {entries.length > 0 ? (
        <p className={styles.loadMore}>
          <button
            type="button"
            className="btn btn-small pending-track"
            onClick={() => void loadMore()}
            aria-disabled={loading || !cursor}
            aria-busy={loading}
            data-testid="history-load-more"
          >
            {loading ? "Loading…" : cursor ? "Load more" : "That’s everything."}
          </button>
        </p>
      ) : null}
      <p className="visually-hidden" role="status">{announcement}</p>
    </section>
  );
}
