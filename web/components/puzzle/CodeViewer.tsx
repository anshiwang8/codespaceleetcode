"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { type RefObject, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import styles from "@/components/puzzle/puzzle.module.css";
import { type ManifestFile, REFERENCE_CAP, type SymbolAtPositionResponse, type SymbolInfo } from "@/lib/api-types";
import { type LineRange, selectionToLines } from "@/lib/client/answer";
import { api } from "@/lib/client/api";
import {
  defineThemes,
  LIGHT_THEME,
  monaco,
  monacoLanguage,
} from "@/lib/client/monaco";
import type { RevealTarget } from "@/lib/client/navigation";
import { snapshotFileUrl } from "@/lib/client/snapshot-urls";

// Monaco comes from the bundle, so the loader must never fall back to its default CDN.
loader.config({ monaco });

type TextModel = monaco.editor.ITextModel;
type CodeEditor = monaco.editor.IStandaloneCodeEditor;

export interface CursorInfo {
  path: string;
  line: number;
  col: number;
  symbol: SymbolInfo | null;
  /** True while the index is being asked about this position. */
  pending: boolean;
  /** How many references the API capped this symbol's list at, or null if it wasn't. */
  referencesCappedAt: number | null;
}

export interface SelectionInfo {
  path: string;
  range: LineRange;
}

export interface ViewerHandle {
  goToDefinition: () => void;
  findReferences: () => void;
}

// Past this size, highlighting a file costs more than it's worth. Ingest caps files at 1 MB.
const LARGE_FILE_CHARS = 512 * 1024;
const REFERENCE_LOAD_CONCURRENCY = 6;
const CURSOR_DEBOUNCE_MS = 120;

class FileLoadError extends Error {
  constructor(
    message: string,
    /** False when trying again can't help, as with a binary file. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Fetches files once, and keeps them as Monaco models for the life of the page. */
class ModelStore {
  private loads = new Map<string, Promise<TextModel>>();
  private symbolLookups = new Map<string, Promise<SymbolAtPositionResponse | null>>();
  /** Models this store made, and so may dispose. Another store's models are never touched. */
  private owned = new Set<TextModel>();
  private disposed = false;

  constructor(
    private snapshotId: number,
    private manifestUrl: string,
    private files: Map<string, ManifestFile>,
  ) {}

  uriOf(path: string): monaco.Uri {
    return monaco.Uri.from({ scheme: "snapshot", authority: String(this.snapshotId), path: `/${path}` });
  }

  pathOf(uri: monaco.Uri): string | null {
    if (uri.scheme !== "snapshot" || uri.authority !== String(this.snapshotId)) return null;
    return uri.path.slice(1);
  }

  load(path: string): Promise<TextModel> {
    const existing = this.loads.get(path);
    if (existing) return existing;
    const load = this.fetchModel(path);
    this.loads.set(path, load);
    load.catch(() => this.loads.delete(path));
    return load;
  }

  private async fetchModel(path: string): Promise<TextModel> {
    let response: Response;
    try {
      response = await fetch(snapshotFileUrl(this.manifestUrl, path));
    } catch {
      throw new FileLoadError("Couldn't reach the server for this file.", true);
    }
    if (!response.ok) {
      throw new FileLoadError(`This file couldn't be loaded (HTTP ${response.status}).`, true);
    }
    const text = await response.text();
    // This store's viewer was replaced while the file was on its way, as when React mounts the
    // effect twice in development. The replacement loads the file itself. Making or adopting a
    // model here would let this store's dispose() destroy the model the new one is showing.
    if (this.disposed) throw new FileLoadError("This file's viewer was closed.", true);
    if (text.includes("\0")) throw new FileLoadError("This is a binary file, so it isn't shown.", false);
    const language = text.length > LARGE_FILE_CHARS ? "plaintext" : monacoLanguage(this.files.get(path)?.language);
    const uri = this.uriOf(path);
    const existing = monaco.editor.getModel(uri);
    if (existing) {
      // Made by someone else, possibly empty (the editor component makes a blank model for a path
      // it can't find). The file's content wins.
      if (existing.getValue() !== text) existing.setValue(text);
      return existing;
    }
    // Monaco keeps a file's own line endings, so CRLF lines count the same as the server's.
    const model = monaco.editor.createModel(text, language, uri);
    this.owned.add(model);
    return model;
  }

  /** Null for anything the index doesn't know about, including when the request fails. */
  lookup(model: TextModel, line: number, column: number): Promise<SymbolAtPositionResponse | null> {
    const path = this.pathOf(model.uri);
    // No word here means whitespace or punctuation, which has no occurrences to ask about.
    const word = model.getWordAtPosition({ lineNumber: line, column });
    if (!path || !word) return Promise.resolve(null);
    // A cursor just past the end of a name is still on it, but the index's end_col is exclusive.
    const col = column === word.endColumn ? column - 1 : column;
    const key = `${path}:${line}:${col}`;
    const existing = this.symbolLookups.get(key);
    if (existing) return existing;
    const lookup = api.symbolAt(this.snapshotId, path, line, col).catch(() => {
      this.symbolLookups.delete(key);
      return null;
    });
    this.symbolLookups.set(key, lookup);
    return lookup;
  }

  dispose(): void {
    // Loads still in flight see `disposed` and make nothing, so only finished ones need disposing.
    this.disposed = true;
    for (const model of this.owned) model.dispose();
    this.owned.clear();
    this.loads.clear();
  }
}

const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  domReadOnly: true,
  readOnlyMessage: { value: "Snapshots are read-only." },
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontFamily: 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  lineHeight: 19,
  renderLineHighlight: "line",
  // These would highlight by matching words, which isn't what the index says.
  occurrencesHighlight: "off",
  selectionHighlight: false,
  wordBasedSuggestions: "off",
  quickSuggestions: false,
  parameterHints: { enabled: false },
  links: false,
  stickyScroll: { enabled: false },
  unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
  // Otherwise a file with U+2028 and the like opens a prompt asking to edit it.
  unusualLineTerminators: "off",
  // Keeps minified single-line files from stalling rendering and highlighting.
  stopRenderingLineAfter: 5000,
  maxTokenizationLineLength: 5000,
  fixedOverflowWidgets: true,
  gotoLocation: { multipleDefinitions: "goto", multipleReferences: "peek" },
};

interface CodeViewerProps {
  viewerRef: RefObject<ViewerHandle | null>;
  snapshotId: number;
  manifestUrl: string;
  filesByPath: Map<string, ManifestFile>;
  activePath: string | null;
  reveal: RevealTarget | null;
  onOpenFile: (path: string, line?: number, col?: number) => void;
  onCursor: (cursor: CursorInfo | null) => void;
  onSelection: (selection: SelectionInfo | null) => void;
}

type Shown = { path: string; uri: string; plain: boolean };
type Failure = { path: string; message: string; retryable: boolean };

export default function CodeViewer({
  viewerRef,
  snapshotId,
  manifestUrl,
  filesByPath,
  activePath,
  reveal,
  onOpenFile,
  onCursor,
  onSelection,
}: CodeViewerProps) {
  const theme = LIGHT_THEME;
  const storeRef = useRef<ModelStore | null>(null);
  const editorRef = useRef<CodeEditor | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const appliedReveal = useRef(0);

  // Long-lived Monaco callbacks read these, rather than being re-registered on each render.
  const callbacks = useRef({ onOpenFile, onCursor, onSelection });
  useEffect(() => {
    callbacks.current = { onOpenFile, onCursor, onSelection };
  });

  // One store per snapshot, and the code-intelligence providers that use it. Providers come from
  // /api/snapshots/:id/symbols only, so nothing here is matched by name (rule 7).
  useEffect(() => {
    const store = new ModelStore(snapshotId, manifestUrl, filesByPath);
    storeRef.current = store;

    const pathOfUri = (uri: monaco.Uri) => store.pathOf(uri);
    const toRange = (line: number, col: number, endCol: number) => new monaco.Range(line, col, line, endCol);

    const definition = monaco.languages.registerDefinitionProvider("*", {
      provideDefinition: async (model, position) => {
        const result = await store.lookup(model, position.lineNumber, position.column);
        if (!result?.symbol) return null;
        const target = result.definition ?? {
          file: result.symbol.file,
          line: result.symbol.startLine,
          col: 1,
          endCol: 1,
        };
        try {
          // The target has to exist as a model for Monaco's preview and peek to show it.
          await store.load(target.file);
        } catch {
          return null;
        }
        return { uri: store.uriOf(target.file), range: toRange(target.line, target.col, target.endCol) };
      },
    });

    const references = monaco.languages.registerReferenceProvider("*", {
      provideReferences: async (model, position, context) => {
        const result = await store.lookup(model, position.lineNumber, position.column);
        if (!result?.symbol) return [];
        const positions = [
          ...(context.includeDeclaration && result.definition ? [result.definition] : []),
          ...result.references,
        ];
        // Monaco's peek needs a model for each file. Leaving any out would quietly shorten the list,
        // which matters when a puzzle asks what uses a symbol.
        const files = [...new Set(positions.map((item) => item.file))];
        const usable = new Set<string>();
        for (let start = 0; start < files.length; start += REFERENCE_LOAD_CONCURRENCY) {
          await Promise.all(
            files.slice(start, start + REFERENCE_LOAD_CONCURRENCY).map((file) =>
              store.load(file).then(
                () => usable.add(file),
                () => {},
              ),
            ),
          );
        }
        return positions
          .filter((item) => usable.has(item.file))
          .map((item) => ({
            uri: store.uriOf(item.file),
            range: toRange(item.line, item.col, item.endCol),
          }));
      },
    });

    const hover = monaco.languages.registerHoverProvider("*", {
      provideHover: async (model, position) => {
        const result = await store.lookup(model, position.lineNumber, position.column);
        if (!result?.symbol) return null;
        return { contents: [{ value: `${result.symbol.kind} \`${result.symbol.symbolId}\`` }] };
      },
    });

    // A target in another file goes through the page's navigation, so the tree, tabs and trail move
    // with it. A target in the same file is left to Monaco.
    const opener = monaco.editor.registerEditorOpener({
      openCodeEditor: (source, resource, selectionOrPosition) => {
        const path = pathOfUri(resource);
        if (!path || source.getModel()?.uri.toString() === resource.toString()) return false;
        const line = selectionOrPosition
          ? "startLineNumber" in selectionOrPosition
            ? selectionOrPosition.startLineNumber
            : selectionOrPosition.lineNumber
          : undefined;
        const col = selectionOrPosition
          ? "startColumn" in selectionOrPosition
            ? selectionOrPosition.startColumn
            : selectionOrPosition.column
          : undefined;
        callbacks.current.onOpenFile(path, line, col);
        return true;
      },
    });

    return () => {
      definition.dispose();
      references.dispose();
      hover.dispose();
      opener.dispose();
      store.dispose();
      storeRef.current = null;
    };
  }, [snapshotId, manifestUrl, filesByPath]);

  useEffect(() => {
    if (!activePath) return;
    let cancelled = false;
    // storeRef is set by the effect above, which runs first in the same commit.
    const store = storeRef.current;
    if (!store) return;
    store.load(activePath).then(
      (model) => {
        if (cancelled) return;
        setFailure(null);
        setShown({
          path: activePath,
          uri: model.uri.toString(),
          plain: model.getValueLength() > LARGE_FILE_CHARS,
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        setFailure({
          path: activePath,
          message: error instanceof Error ? error.message : "This file couldn't be loaded.",
          retryable: !(error instanceof FileLoadError) || error.retryable,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activePath, attempt, filesByPath, manifestUrl, snapshotId]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!reveal || !editorReady || !editor || shown?.path !== reveal.path) return;
    if (appliedReveal.current === reveal.nonce) return;
    appliedReveal.current = reveal.nonce;
    editor.setPosition({ lineNumber: reveal.line, column: reveal.col });
    editor.revealPositionInCenterIfOutsideViewport({ lineNumber: reveal.line, column: reveal.col });
  }, [reveal, editorReady, shown]);

  useImperativeHandle(
    viewerRef,
    () => ({
      goToDefinition: () => {
        editorRef.current?.focus();
        editorRef.current?.trigger("action-bar", "editor.action.revealDefinition", null);
      },
      findReferences: () => {
        editorRef.current?.focus();
        editorRef.current?.trigger("action-bar", "editor.action.referenceSearch.trigger", null);
      },
    }),
    [],
  );

  const handleMount = useCallback<OnMount>((editor) => {
    editorRef.current = editor;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request = 0;

    const reportCursor = () => {
      const store = storeRef.current;
      const model = editor.getModel();
      const position = editor.getPosition();
      const path = model && store ? store.pathOf(model.uri) : null;
      clearTimeout(timer);
      request += 1;
      if (!model || !position || !path || !store) {
        callbacks.current.onCursor(null);
        return;
      }
      const base = { path, line: position.lineNumber, col: position.column };
      callbacks.current.onCursor({ ...base, symbol: null, pending: true, referencesCappedAt: null });
      const current = request;
      timer = setTimeout(() => {
        void store.lookup(model, position.lineNumber, position.column).then((result) => {
          if (current !== request) return;
          callbacks.current.onCursor({
            ...base,
            symbol: result?.symbol ?? null,
            pending: false,
            referencesCappedAt: result?.referencesTruncated ? REFERENCE_CAP : null,
          });
        });
      }, CURSOR_DEBOUNCE_MS);
    };

    const reportSelection = () => {
      const store = storeRef.current;
      const model = editor.getModel();
      const selection = editor.getSelection();
      const path = model && store ? store.pathOf(model.uri) : null;
      const range = selection ? selectionToLines(selection) : null;
      callbacks.current.onSelection(path && range ? { path, range } : null);
    };

    editor.onDidChangeCursorPosition(reportCursor);
    editor.onDidChangeCursorSelection(reportSelection);
    editor.onDidChangeModel(() => {
      reportCursor();
      reportSelection();
    });
    editor.onDidDispose(() => clearTimeout(timer));
    setEditorReady(true);
  }, []);

  const failed = failure && failure.path === activePath ? failure : null;
  const loading = activePath !== null && !failed && shown?.path !== activePath;

  return (
    <div className={styles.viewer} data-testid="code-viewer" data-shown-path={shown?.path ?? ""}>
      {shown && activePath === shown.path && shown.plain ? (
        <p className={styles.viewerNotice} data-testid="large-file-notice">
          Large file: syntax highlighting is off to keep this responsive.
        </p>
      ) : null}
      <div className={styles.viewerEditor}>
        {shown ? (
          <Editor
            path={shown.uri}
            theme={theme}
            options={EDITOR_OPTIONS}
            keepCurrentModel
            beforeMount={defineThemes}
            onMount={handleMount}
            loading={<div className={styles.viewerMessage}>Loading the editor…</div>}
          />
        ) : null}
        {!activePath ? (
          <div className={styles.viewerOverlay} data-testid="no-file-open">
            Open a file from the tree or from search.
          </div>
        ) : null}
        {loading ? (
          <div className={styles.viewerOverlay} role="status">
            Loading {activePath}…
          </div>
        ) : null}
        {failed ? (
          <div className={styles.viewerOverlay} role="alert" data-testid="file-error">
            <p>{failed.message}</p>
            {failed.retryable ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setFailure(null);
                  setAttempt(attempt + 1);
                }}
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
