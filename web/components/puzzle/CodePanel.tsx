"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { ActionBar } from "@/components/puzzle/ActionBar";
import type { CursorInfo, SelectionInfo, ViewerHandle } from "@/components/puzzle/CodeViewer";
import { EditorTabs } from "@/components/puzzle/EditorTabs";
import { FileTree } from "@/components/puzzle/FileTree";
import { OutlineList } from "@/components/puzzle/OutlineList";
import { SearchPanel } from "@/components/puzzle/SearchPanel";
import { Splitter } from "@/components/puzzle/Splitter";
import { VisitedTrail } from "@/components/puzzle/VisitedTrail";
import styles from "@/components/puzzle/puzzle.module.css";
import type { Manifest, ManifestFile } from "@/lib/api-types";
import type { Draft, DraftAction } from "@/lib/client/answer";
import type { NavigationAction, NavigationState } from "@/lib/client/navigation";

// Monaco touches `window` as soon as it's imported, and it's a big download, so it loads apart from
// the rest of the page and only in the browser.
const CodeViewer = dynamic(() => import("@/components/puzzle/CodeViewer"), {
  ssr: false,
  loading: () => (
    <div className={styles.viewerMessage} role="status">
      Loading the editor…
    </div>
  ),
});

type ManifestState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; manifest: Manifest };

interface CodePanelProps {
  snapshotId: number;
  manifestUrl: string;
  repoUrl: string;
  sha: string;
  manifestState: ManifestState;
  onRetryManifest: () => void;
  files: ManifestFile[] | null;
  filesByPath: Map<string, ManifestFile>;
  navigation: NavigationState;
  navigate: (action: NavigationAction) => void;
  openFile: (path: string, line?: number, col?: number) => void;
  draft: Draft;
  pick: (action: DraftAction) => void;
}

export function CodePanel({
  snapshotId,
  manifestUrl,
  repoUrl,
  sha,
  manifestState,
  onRetryManifest,
  files,
  filesByPath,
  navigation,
  navigate,
  openFile,
  draft,
  pick,
}: CodePanelProps) {
  const [sidebarWidth, setSidebarWidth] = useState(230);
  const [sidebarTab, setSidebarTab] = useState<"files" | "search">("files");
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const viewerRef = useRef<ViewerHandle | null>(null);
  const activePath = navigation.activePath;

  return (
    <section
      className={styles.codePanel}
      aria-label="Code"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <div className={styles.sidebar}>
        <div className={styles.sidebarTabs} role="tablist" aria-label="Sidebar">
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === "files"}
            className={sidebarTab === "files" ? styles.sidebarTabActive : styles.sidebarTab}
            onClick={() => setSidebarTab("files")}
          >
            Files
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === "search"}
            className={sidebarTab === "search" ? styles.sidebarTabActive : styles.sidebarTab}
            onClick={() => setSidebarTab("search")}
          >
            Search
          </button>
        </div>
        <div className={styles.sidebarBody} hidden={sidebarTab !== "files"}>
          {manifestState.state === "loading" ? (
            <p className={styles.sidebarMessage} role="status">
              Loading files…
            </p>
          ) : null}
          {manifestState.state === "error" ? (
            <div className={styles.sidebarMessage} role="alert" data-testid="manifest-error">
              <p>{manifestState.message}</p>
              <p className="muted">
                Check that the snapshot exists in <code>ingest/out/</code>.
              </p>
              <button type="button" className="btn btn-small" onClick={onRetryManifest}>
                Try again
              </button>
            </div>
          ) : null}
          {files ? (
            <FileTree
              files={files}
              activePath={activePath}
              expanded={navigation.expanded}
              onToggleDir={(path) => navigate({ type: "toggle-dir", path })}
              onOpenFile={openFile}
              draft={draft}
              pick={pick}
            />
          ) : null}
        </div>
        <div className={styles.sidebarBody} hidden={sidebarTab !== "search"}>
          <SearchPanel snapshotId={snapshotId} onOpen={openFile} />
        </div>
        <OutlineList
          snapshotId={snapshotId}
          path={activePath}
          onOpen={openFile}
          draft={draft}
          pick={pick}
        />
      </div>
      <Splitter
        label="Resize the file sidebar"
        value={sidebarWidth}
        min={160}
        max={480}
        onChange={setSidebarWidth}
      />
      <div className={styles.editorColumn}>
        <EditorTabs
          tabs={navigation.tabs}
          activePath={activePath}
          onSelect={(path) => openFile(path)}
          onClose={(path) => navigate({ type: "close", path })}
        />
        <VisitedTrail trail={navigation.trail} activePath={activePath} onOpen={(path) => openFile(path)} />
        <div className={styles.viewerHost}>
          {files ? (
            <CodeViewer
              viewerRef={viewerRef}
              snapshotId={snapshotId}
              manifestUrl={manifestUrl}
              filesByPath={filesByPath}
              activePath={activePath}
              reveal={navigation.reveal}
              onOpenFile={openFile}
              onCursor={setCursor}
              onSelection={setSelection}
            />
          ) : (
            <div className={styles.viewerMessage}>
              {manifestState.state === "error" ? "No files to show." : "Loading files…"}
            </div>
          )}
        </div>
        <ActionBar
          activePath={activePath}
          cursor={cursor}
          selection={selection}
          draft={draft}
          pick={pick}
          repoUrl={repoUrl}
          sha={sha}
          viewerRef={viewerRef}
        />
      </div>
    </section>
  );
}
