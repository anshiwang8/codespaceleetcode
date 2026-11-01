"use client";

import { useEffect, useState } from "react";
import styles from "@/components/puzzle/puzzle.module.css";
import type { SymbolInfo } from "@/lib/api-types";
import { type Draft, type DraftAction, symbolPick } from "@/lib/client/answer";
import { ApiRequestError, api } from "@/lib/client/api";

type OutlineState =
  | { path: string; state: "ready"; symbols: SymbolInfo[] }
  | { path: string; state: "error"; message: string };

interface OutlineListProps {
  snapshotId: number;
  path: string | null;
  onOpen: (path: string, line: number) => void;
  draft: Draft;
  pick: (action: DraftAction) => void;
}

export function OutlineList({ snapshotId, path, onOpen, draft, pick }: OutlineListProps) {
  const [outline, setOutline] = useState<OutlineState | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api.outline(snapshotId, path).then(
      ({ symbols }) => {
        if (!cancelled) setOutline({ path, state: "ready", symbols });
      },
      (error: unknown) => {
        if (cancelled) return;
        // A file the index doesn't have, like a binary, simply has no outline.
        if (error instanceof ApiRequestError && error.status === 404) {
          setOutline({ path, state: "ready", symbols: [] });
        } else {
          setOutline({
            path,
            state: "error",
            message: error instanceof ApiRequestError ? error.message : "The outline couldn't be loaded.",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [snapshotId, path, attempt]);

  const current = outline && outline.path === path ? outline : null;

  return (
    <section className={styles.outline} aria-label="Outline of the current file" data-testid="outline">
      <h3 className={styles.outlineHeading}>Outline</h3>
      <div className={styles.outlineScroll}>
        {!path ? <p className={styles.sidebarMessage}>Open a file to see its symbols.</p> : null}
        {path && !current ? (
          <p className={styles.sidebarMessage} role="status">
            Loading…
          </p>
        ) : null}
        {current?.state === "error" ? (
          <div className={styles.sidebarMessage} role="alert">
            <p>{current.message}</p>
            <button type="button" className="btn btn-small" onClick={() => setAttempt(attempt + 1)}>
              Try again
            </button>
          </div>
        ) : null}
        {current?.state === "ready" && current.symbols.length === 0 ? (
          <p className={styles.sidebarMessage} data-testid="outline-empty">
            No indexed symbols in this file.
          </p>
        ) : null}
        {current?.state === "ready" ? (
          <ul>
            {current.symbols.map((symbol) => {
              const action = symbolPick(draft, symbol.symbolId);
              return (
                <li key={symbol.symbolId} className={styles.outlineRow} data-testid="outline-row" data-symbol={symbol.symbolId}>
                  <button
                    type="button"
                    className={styles.outlineName}
                    title={`${symbol.kind}: ${symbol.symbolId}`}
                    onClick={() => onOpen(symbol.file, symbol.startLine)}
                  >
                    <span className={styles.outlineKind}>{symbol.kind.slice(0, 2)}</span>
                    <span className={styles.outlineLabel}>{symbol.name}</span>
                  </button>
                  {action ? (
                    <button
                      type="button"
                      className={action.active ? styles.treePickActive : styles.treePick}
                      aria-label={`${action.label}: ${symbol.symbolId}`}
                      title={`${action.label}: ${symbol.symbolId}`}
                      data-testid="outline-pick"
                      data-symbol={symbol.symbolId}
                      onClick={() => pick({ type: "pick-symbol", id: symbol.symbolId })}
                    >
                      {action.active ? "✓" : "+"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
