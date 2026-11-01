"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/components/puzzle/puzzle.module.css";
import type { ManifestFile } from "@/lib/api-types";
import { type Draft, type DraftAction, filePick } from "@/lib/client/answer";
import { buildTree, type TreeNode } from "@/lib/client/file-tree";

const FILTER_RESULT_LIMIT = 200;

interface FileTreeProps {
  files: ManifestFile[];
  activePath: string | null;
  expanded: string[];
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  draft: Draft;
  pick: (action: DraftAction) => void;
}

export function FileTree({ files, activePath, expanded, onToggleDir, onOpenFile, draft, pick }: FileTreeProps) {
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter.trim().toLowerCase());
  const tree = useMemo(() => buildTree(files), [files]);
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the open file in view, so a jump to another file shows up here too. Opening a file expands
  // its folders in the same update, so its row is already there. Folding a folder doesn't scroll.
  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activePath]);

  const matches = useMemo(() => {
    if (!deferredFilter) return null;
    return files.filter((file) => file.path.toLowerCase().includes(deferredFilter));
  }, [files, deferredFilter]);

  return (
    <div className={styles.treeRoot}>
      {/* Filters the tree only. It can't reach the answer: a file still has to be clicked. */}
      <label className={styles.filterLabel}>
        <span className="visually-hidden">Filter files by path</span>
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter files"
          autoComplete="off"
          spellCheck={false}
          className={styles.sidebarInput}
          data-testid="file-filter"
        />
      </label>
      <div ref={containerRef} className={styles.treeScroll} data-testid="file-tree">
        {files.length === 0 ? <p className={styles.sidebarMessage}>This snapshot has no files.</p> : null}
        {matches ? (
          <>
            {matches.length === 0 ? <p className={styles.sidebarMessage}>No files match.</p> : null}
            <ul>
              {matches.slice(0, FILTER_RESULT_LIMIT).map((file) => (
                <FileRow
                  key={file.path}
                  path={file.path}
                  label={file.path}
                  depth={0}
                  active={file.path === activePath}
                  onOpenFile={onOpenFile}
                  draft={draft}
                  pick={pick}
                />
              ))}
            </ul>
            {matches.length > FILTER_RESULT_LIMIT ? (
              <p className={styles.sidebarMessage}>
                Showing the first {FILTER_RESULT_LIMIT} of {matches.length}. Keep typing to narrow it.
              </p>
            ) : null}
          </>
        ) : (
          <TreeItems
            nodes={tree}
            depth={0}
            activePath={activePath}
            expanded={expandedSet}
            onToggleDir={onToggleDir}
            onOpenFile={onOpenFile}
            draft={draft}
            pick={pick}
          />
        )}
      </div>
    </div>
  );
}

interface TreeItemsProps {
  nodes: TreeNode[];
  depth: number;
  activePath: string | null;
  expanded: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  draft: Draft;
  pick: (action: DraftAction) => void;
}

// Only expanded folders render, so a 24,000-file snapshot stays cheap.
function TreeItems({ nodes, depth, activePath, expanded, onToggleDir, onOpenFile, draft, pick }: TreeItemsProps) {
  return (
    <ul>
      {nodes.map((node) => {
        if (node.children === null) {
          return (
            <FileRow
              key={node.path}
              path={node.path}
              label={node.name}
              depth={depth}
              active={node.path === activePath}
              onOpenFile={onOpenFile}
              draft={draft}
              pick={pick}
            />
          );
        }
        const open = expanded.has(node.path);
        return (
          <li key={node.path}>
            <div className={styles.treeRow} style={{ "--depth": depth } as React.CSSProperties}>
              <button
                type="button"
                className={styles.treeName}
                aria-expanded={open}
                data-testid="tree-dir"
                data-path={node.path}
                onClick={() => onToggleDir(node.path)}
              >
                <span className={styles.treeCaret} aria-hidden="true">
                  {open ? "▾" : "▸"}
                </span>
                {node.name}
              </button>
            </div>
            {open ? (
              <TreeItems
                nodes={node.children}
                depth={depth + 1}
                activePath={activePath}
                expanded={expanded}
                onToggleDir={onToggleDir}
                onOpenFile={onOpenFile}
                draft={draft}
                pick={pick}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface FileRowProps {
  path: string;
  label: string;
  depth: number;
  active: boolean;
  onOpenFile: (path: string) => void;
  draft: Draft;
  pick: (action: DraftAction) => void;
}

const FileRow = memo(function FileRow({ path, label, depth, active, onOpenFile, draft, pick }: FileRowProps) {
  const action = filePick(draft, path);
  return (
    <li>
      <div
        className={active ? styles.treeRowActive : styles.treeRow}
        style={{ "--depth": depth } as React.CSSProperties}
        data-active={active}
      >
        <button
          type="button"
          className={styles.treeName}
          title={path}
          aria-current={active ? "true" : undefined}
          data-testid="tree-file"
          data-path={path}
          onClick={() => onOpenFile(path)}
        >
          <span className={styles.treeCaret} aria-hidden="true" />
          {label}
        </button>
        {action ? (
          <button
            type="button"
            className={action.active ? styles.treePickActive : styles.treePick}
            aria-label={`${action.label}: ${path}`}
            title={`${action.label}: ${path}`}
            data-testid="tree-pick"
            data-path={path}
            onClick={() => pick({ type: "pick-file", path })}
          >
            {action.active ? "✓" : "+"}
          </button>
        ) : null}
      </div>
    </li>
  );
});
