"use client";

import type { RefObject } from "react";
import type { CursorInfo, SelectionInfo, ViewerHandle } from "@/components/puzzle/CodeViewer";
import styles from "@/components/puzzle/puzzle.module.css";
import { type Draft, type DraftAction, filePick, locationId, symbolPick } from "@/lib/client/answer";
import { githubFileUrl } from "@/lib/client/snapshot-urls";

interface ActionBarProps {
  activePath: string | null;
  cursor: CursorInfo | null;
  selection: SelectionInfo | null;
  draft: Draft;
  pick: (action: DraftAction) => void;
  repoUrl: string;
  sha: string;
  viewerRef: RefObject<ViewerHandle | null>;
}

/** The strip under the editor: where what you're looking at becomes an answer, by one click. */
export function ActionBar({ activePath, cursor, selection, draft, pick, repoUrl, sha, viewerRef }: ActionBarProps) {
  const cursorHere = cursor && cursor.path === activePath ? cursor : null;
  const symbol = cursorHere?.symbol ?? null;
  const symbolAction = symbol ? symbolPick(draft, symbol.symbolId) : null;
  const fileAction = activePath ? filePick(draft, activePath) : null;
  const selectionHere = selection && selection.path === activePath ? selection : null;
  const takesSymbols = draft.kind === "symbol" || draft.kind === "sequence" || draft.kind === "set";

  return (
    <div className={styles.actionBar} data-testid="action-bar">
      <div className={styles.actionRow}>
        <span className={styles.actionLabel}>Symbol</span>
        {symbol ? (
          <>
            <code className={styles.actionId} title={`${symbol.kind}: ${symbol.symbolId}`} data-testid="cursor-symbol">
              {symbol.symbolId}
            </code>
            {symbolAction ? (
              <button
                type="button"
                className={symbolAction.active ? "btn btn-small" : "btn btn-small btn-primary"}
                data-testid="pick-cursor-symbol"
                onClick={() => pick({ type: "pick-symbol", id: symbol.symbolId })}
              >
                {symbolAction.label}
              </button>
            ) : null}
          </>
        ) : (
          <span className={styles.actionHint} data-testid="cursor-symbol-none">
            {cursorHere?.pending
              ? "Looking up…"
              : cursorHere
                ? "No indexed symbol at the cursor."
                : takesSymbols
                  ? "Click a name in the code to see its symbol."
                  : "Click a name in the code to look it up."}
          </span>
        )}
        <span className={styles.actionSpacer} />
        <button
          type="button"
          className="btn btn-small btn-quiet"
          title="Go to definition (F12 or ctrl-click)"
          disabled={!symbol}
          data-testid="go-to-definition"
          onClick={() => viewerRef.current?.goToDefinition()}
        >
          Definition
        </button>
        <button
          type="button"
          className="btn btn-small btn-quiet"
          title={
            cursorHere?.referencesCappedAt
              ? `This symbol has more references than the ${cursorHere.referencesCappedAt} listed. Use Search for the rest.`
              : "Find references (shift-F12)"
          }
          disabled={!symbol}
          data-testid="find-references"
          onClick={() => viewerRef.current?.findReferences()}
        >
          {cursorHere?.referencesCappedAt ? `References (first ${cursorHere.referencesCappedAt})` : "References"}
        </button>
      </div>

      {fileAction && activePath ? (
        <div className={styles.actionRow}>
          <span className={styles.actionLabel}>File</span>
          <code className={styles.actionId} title={activePath}>
            {activePath}
          </code>
          <button
            type="button"
            className={fileAction.active ? "btn btn-small" : "btn btn-small btn-primary"}
            data-testid="pick-open-file"
            onClick={() => pick({ type: "pick-file", path: activePath })}
          >
            {fileAction.label}
          </button>
        </div>
      ) : null}

      {draft.kind === "location" ? (
        <div className={styles.actionRow}>
          <span className={styles.actionLabel}>Lines</span>
          {selectionHere ? (
            <>
              <code className={styles.actionId} data-testid="selection-id">
                {locationId(selectionHere.path, selectionHere.range)}
              </code>
              <button
                type="button"
                className="btn btn-small btn-primary"
                data-testid="pick-selection"
                onClick={() =>
                  pick({ type: "pick-location", id: locationId(selectionHere.path, selectionHere.range) })
                }
              >
                Select as answer
              </button>
            </>
          ) : (
            <span className={styles.actionHint}>Select lines in the editor.</span>
          )}
        </div>
      ) : null}

      {activePath ? (
        <div className={styles.actionFileLink}>
          <a
            href={githubFileUrl(repoUrl, sha, activePath)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="open-on-github"
          >
            Open this file on GitHub
          </a>
        </div>
      ) : null}
    </div>
  );
}
