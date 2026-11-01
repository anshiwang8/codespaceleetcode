"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/puzzle/puzzle.module.css";
import type { SearchMatch, SearchResponse } from "@/lib/api-types";
import { ApiRequestError, api } from "@/lib/client/api";

const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;

type SearchState =
  | { query: string; state: "ready"; response: SearchResponse }
  | { query: string; state: "error"; message: string };

interface SearchPanelProps {
  snapshotId: number;
  onOpen: (path: string, line: number, col?: number) => void;
}

/** Text search over the snapshot's files. It only navigates: its results can't become an answer. */
export function SearchPanel({ snapshotId, onOpen }: SearchPanelProps) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState<SearchState | null>(null);
  const query = text.trim();
  const active = query.length >= MIN_LENGTH;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.search(snapshotId, query).then(
        (response) => {
          if (!cancelled) setSearch({ query, state: "ready", response });
        },
        (error: unknown) => {
          if (cancelled) return;
          setSearch({
            query,
            state: "error",
            message: error instanceof ApiRequestError ? error.message : "Search failed.",
          });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [snapshotId, query, active]);

  const current = search && search.query === query ? search : null;
  const groups = useMemo(() => {
    if (current?.state !== "ready") return [];
    const byFile = new Map<string, SearchMatch[]>();
    for (const match of current.response.matches) {
      const list = byFile.get(match.file);
      if (list) list.push(match);
      else byFile.set(match.file, [match]);
    }
    return [...byFile.entries()];
  }, [current]);

  return (
    <div className={styles.treeRoot}>
      <label className={styles.filterLabel}>
        <span className="visually-hidden">Search file contents</span>
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search file contents"
          autoComplete="off"
          spellCheck={false}
          className={styles.sidebarInput}
          data-testid="search-input"
        />
      </label>
      <div className={styles.treeScroll} data-testid="search-results">
        {!active ? (
          <p className={styles.sidebarMessage}>Type at least {MIN_LENGTH} characters.</p>
        ) : null}
        {active && !current ? (
          <p className={styles.sidebarMessage} role="status">
            Searching…
          </p>
        ) : null}
        {active && current?.state === "error" ? (
          <p className={styles.sidebarMessage} role="alert">
            {current.message}
          </p>
        ) : null}
        {active && current?.state === "ready" && current.response.matches.length === 0 ? (
          <p className={styles.sidebarMessage} data-testid="search-empty">
            No matches.
          </p>
        ) : null}
        {active
          ? groups.map(([file, matches]) => (
              <div key={file} className={styles.searchGroup}>
                <div className={styles.searchFile} title={file}>
                  {file}
                </div>
                <ul>
                  {matches.map((match) => (
                    <li key={match.line}>
                      <button
                        type="button"
                        className={styles.searchMatch}
                        title={`${file}:${match.line}`}
                        data-testid="search-match"
                        onClick={() => onOpen(match.file, match.line)}
                      >
                        <span className={styles.searchLine}>{match.line}</span>
                        <span className={styles.searchText}>{match.text.trim()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          : null}
        {active && current?.state === "ready" && current.response.truncated ? (
          <p className={styles.sidebarMessage}>
            Showing the first {current.response.matches.length} matches. Narrow the search to see the rest.
          </p>
        ) : null}
      </div>
    </div>
  );
}
