"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/components/profile/profile.module.css";
import type { Difficulty, HistoryEntry, HistoryFilters, HistoryPage, PuzzleType } from "@/lib/api-types";
import { PUZZLES_PATH } from "@/lib/browse";
import { ApiRequestError, api } from "@/lib/client/api";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { formatDateTime, formatLongDay } from "@/lib/format";
import { Icon } from "@/components/site/Icon";
import { IntentLink } from "@/components/site/IntentLink";

type ListFilters = Omit<HistoryFilters, "date">;

interface HistoryListProps {
  /** The first page with no filters, rendered on the server. */
  initial: HistoryPage;
  /** Repositories to offer in the filter: those with published puzzles. */
  repos: string[];
  /** A date picked in the activity calendar, or null. */
  date: string | null;
  onClearDate: () => void;
}

const isEmpty = (filters: ListFilters) => !filters.type && !filters.difficulty && !filters.repo && !filters.outcome;

/**
 * Submissions, newest first. Filters run on the server over the whole history, and "Load more"
 * continues the same filtered list. A change of filter drops any request still running, so an
 * older answer can never replace a newer one.
 */
export function HistoryList({ initial, repos, date, onClearDate }: HistoryListProps) {
  const [filters, setFilters] = useState<ListFilters>({});
  const [entries, setEntries] = useState<HistoryEntry[]>(initial.entries);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState<"page" | "more" | null>(null);
  const [error, setError] = useState<{ message: string; retry: "page" | "more" } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => request.current?.abort(), []);

  const fetchPage = useCallback(
    async (list: ListFilters, day: string | null, before: string | null) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const ticket = ++generation.current;
      const kind = before ? "more" : "page";
      setLoading(kind);
      setError(null);
      try {
        const page = await api.history(
          { ...list, ...(day ? { date: day } : {}), ...(before ? { before } : {}) },
          controller.signal,
        );
        if (ticket !== generation.current) return;
        if (before) {
          setEntries((shown) => {
            const seen = new Set(shown.map((entry) => entry.id));
            return [...shown, ...page.entries.filter((entry) => !seen.has(entry.id))];
          });
          setAnnouncement(`${page.entries.length} older submissions loaded.`);
        } else {
          setEntries(page.entries);
          setAnnouncement(
            page.entries.length === 0
              ? "No submissions match."
              : `Showing ${page.entries.length}${page.nextCursor ? " or more" : ""} matching submissions.`,
          );
        }
        setCursor(page.nextCursor);
      } catch (caught) {
        if (ticket !== generation.current || controller.signal.aborted) return;
        setError({
          message:
            caught instanceof ApiRequestError && caught.status === 401
              ? "You've been signed out. Sign in again to see your submissions."
              : before
                ? "Couldn't load more submissions."
                : "Couldn't load these submissions.",
          retry: kind,
        });
      } finally {
        if (ticket === generation.current) {
          request.current = null;
          setLoading(null);
        }
      }
    },
    [],
  );

  /** Back to the server's first, unfiltered page, dropping anything in flight. */
  const reset = useCallback(() => {
    request.current?.abort();
    request.current = null;
    generation.current++;
    setEntries(initial.entries);
    setCursor(initial.nextCursor);
    setLoading(null);
    setError(null);
    setAnnouncement("Showing all submissions.");
  }, [initial]);

  const load = useCallback(
    (list: ListFilters, day: string | null) => {
      if (!day && isEmpty(list)) reset();
      else void fetchPage(list, day, null);
    },
    [fetchPage, reset],
  );

  // A date picked in the calendar refilters from the first page. The first render already shows
  // the right page, so only a change of date loads.
  const filtersRef = useRef(filters);
  const shownDate = useRef(date);
  useEffect(() => {
    if (shownDate.current === date) return;
    shownDate.current = date;
    load(filtersRef.current, date);
  }, [date, load]);

  const change = (next: ListFilters) => {
    filtersRef.current = next;
    setFilters(next);
    load(next, date);
  };

  const set = <K extends keyof ListFilters>(key: K, value: string) =>
    change({ ...filters, [key]: value === "" ? undefined : (value as ListFilters[K]) });

  const filtered = !isEmpty(filters) || date !== null;
  const hasAnyHistory = initial.entries.length > 0;

  return (
    <section
      id="history"
      className={`card ${styles.history}`}
      aria-labelledby="history-heading"
      data-testid="history"
      tabIndex={-1}
    >
      <div className={styles.sectionHeader}>
        <h2 id="history-heading" className="section-title">
          Recent submissions
        </h2>
        <p className={styles.sectionNote}>Every graded answer, newest first. Times are in UTC.</p>
      </div>

      {hasAnyHistory ? (
        <div className={styles.historyFilters} role="group" aria-label="Filter submissions">
          <FilterSelect
            label="Type"
            value={filters.type ?? ""}
            onChange={(value) => set("type", value)}
            options={(Object.keys(TYPE_LABELS) as PuzzleType[]).map((type) => [type, TYPE_LABELS[type]])}
            all="All types"
          />
          <FilterSelect
            label="Difficulty"
            value={filters.difficulty ?? ""}
            onChange={(value) => set("difficulty", value)}
            options={(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((level) => [level, DIFFICULTY_LABELS[level]])}
            all="All difficulties"
          />
          <FilterSelect
            label="Repository"
            value={filters.repo ?? ""}
            onChange={(value) => set("repo", value)}
            options={repos.map((repo) => [repo, repo])}
            all="All repositories"
          />
          <FilterSelect
            label="Result"
            value={filters.outcome ?? ""}
            onChange={(value) => set("outcome", value)}
            options={[
              ["passed", "Correct"],
              ["failed", "Incorrect"],
            ]}
            all="All results"
          />
          {!isEmpty(filters) ? (
            <button type="button" className={`btn btn-small btn-quiet ${styles.clearFilters}`} onClick={() => change({})}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {date ? (
        <p className={styles.dateChip} data-testid="history-date">
          <span>
            Showing <strong>{formatLongDay(date)}</strong> (UTC), picked in Activity.
          </span>
          <button type="button" className="btn btn-small btn-quiet" onClick={onClearDate}>
            Show all dates
          </button>
        </p>
      ) : null}

      <div
        className={styles.historyBody}
        aria-busy={loading === "page"}
        data-loading={loading === "page" ? "true" : undefined}
      >
        {entries.length === 0 && loading !== "page" && !error ? (
          filtered ? (
            <div className="empty" data-testid="history-no-matches">
              <strong>No submissions match.</strong>
              <span>
                {date
                  ? `Nothing matches on ${formatLongDay(date)} (UTC). Try another date or clear the filters.`
                  : "Try other filters, or clear them to see everything."}
              </span>
            </div>
          ) : (
            <div className="empty" data-testid="history-empty">
              <strong>No submissions yet.</strong>
              <span>Your answers show up here once you submit one.</span>
              <Link href={PUZZLES_PATH} className="btn btn-small">
                Find a puzzle
              </Link>
            </div>
          )
        ) : (
          <ol className={styles.historyList}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.historyItem} data-testid="history-entry">
                <span className={`badge ${entry.passed ? "badge-ok" : "badge-bad"} ${styles.historyResult}`}>
                  <Icon name={entry.passed ? "check" : "x"} />
                  {entry.passed ? "Correct" : "Incorrect"}
                </span>
                <span className={styles.historyMain}>
                  <IntentLink href={`/puzzles/${entry.slug}`} className={styles.historyTitle}>
                    {entry.title}
                  </IntentLink>
                  <span className={styles.historyMeta}>
                    <span>{entry.repoSlug}</span>
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
      </div>

      {error ? (
        <p className="notice notice-error" role="alert" data-testid="history-error">
          {error.message}{" "}
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void fetchPage(filters, date, error.retry === "more" ? cursor : null)}
          >
            Try again
          </button>
        </p>
      ) : null}
      {entries.length > 0 ? (
        <p className={styles.loadMore}>
          <button
            type="button"
            className="btn btn-small pending-track"
            onClick={() => {
              if (cursor && !loading) void fetchPage(filters, date, cursor);
            }}
            aria-disabled={loading !== null || !cursor}
            aria-busy={loading === "more"}
            data-testid="history-load-more"
          >
            {loading === "more" ? "Loading…" : cursor ? "Load more" : "That’s everything."}
          </button>
        </p>
      ) : null}
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  all: string;
}) {
  return (
    <label className={styles.historyFilter}>
      <span className="field-label">{label}</span>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{all}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
