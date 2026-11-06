// Browser only. Monaco comes out of this app's own bundle, so it never touches a CDN and works
// offline.
//
// This deliberately imports the bare editor rather than the package's main entry. The main entry
// also brings TypeScript's language service, which would answer go-to-definition by itself from
// whatever models happen to be open. Code intelligence has to come from the SCIP index (rule 7).
import { errorHandler } from "monaco-editor/base/common/errors.js";
import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/features/register.all.js";
import "monaco-editor/languages/definitions/css/register.js";
import "monaco-editor/languages/definitions/go/register.js";
import "monaco-editor/languages/definitions/html/register.js";
import "monaco-editor/languages/definitions/ini/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/shell/register.js";
import "monaco-editor/languages/definitions/typescript/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";

const environment: monaco.Environment = {
  getWorker: () => new Worker(new URL("./monaco.worker.ts", import.meta.url), { type: "module" }),
};
(globalThis as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = environment;

// Find references keeps a model per referencing file, and a popular symbol has hundreds. Past 200
// models Monaco's leak heuristic throws an uncaught error, though nothing is leaking: they're all
// wanted for the life of the page. Every other error still goes through.
const reportUnexpectedError = errorHandler.unexpectedErrorHandler;
errorHandler.unexpectedErrorHandler = (error) => {
  if (error instanceof Error && error.name === "ListenerLeakError") return;
  reportUnexpectedError(error);
};

export { monaco };
export type Monaco = typeof monaco;

const LANGUAGE_IDS: Record<string, string> = {
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
  go: "go",
  markdown: "markdown",
  html: "html",
  css: "css",
  yaml: "yaml",
  shell: "shell",
  // No bundled grammar for these, and these two are close enough to read comfortably.
  json: "javascript",
  toml: "ini",
};

/** The Monaco language for a manifest language. Anything unknown renders as plain text. */
export function monacoLanguage(manifestLanguage: string | undefined): string {
  return LANGUAGE_IDS[manifestLanguage ?? ""] ?? "plaintext";
}

// The editor's colors come from the page's theme tokens (app/globals.css, lib/themes/). Monaco
// needs literal colors, so they're read from the computed custom properties each time the theme
// changes, and the one editor theme is redefined in place. Redefining and calling setTheme restyles
// open editors without remounting them, so selections, scroll positions and models are kept.
export const ACTIVE_THEME = "cb-active";

/** `#rrggbb` or `rgb(r g b / n%)` as Monaco's `#rrggbb[aa]`. Anything else falls back. */
export function monacoColor(value: string, fallback: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return `#${hex[1]}`;
  const rgb = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3}) \/ (\d{1,3})%\)$/.exec(value);
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("");
    const alpha = Math.round((Number(rgb[4]) / 100) * 255).toString(16).padStart(2, "0");
    return `#${parts}${alpha}`;
  }
  return fallback;
}

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return monacoColor(getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim(), fallback);
}

const bare = (color: string) => color.replace(/^#/, "").slice(0, 6);

export function defineThemes(api: Pick<typeof monaco, "editor">): void {
  const dark = typeof document !== "undefined" && document.documentElement.dataset.scheme === "dark";
  const keyword = token("syntax-keyword", "#cf222e");
  const string = token("syntax-string", "#0a3069");
  const type = token("syntax-type", "#953800");
  const number = token("syntax-number", "#0550ae");
  const comment = token("syntax-comment", "#6a737d");
  const fn = token("syntax-function", "#8250df");
  const muted = token("text-muted", "#4b5563");
  const editorBg = token("editor-bg", "#ffffff");
  const text = token("text", "#111827");
  const accent = token("accent", "#2563eb");
  const line = token("line-strong", "#d1d5db");
  const raised = token("panel-raised", "#f6f8fa");
  api.editor.defineTheme(ACTIVE_THEME, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: bare(comment), fontStyle: "italic" },
      { token: "keyword", foreground: bare(keyword) },
      { token: "string", foreground: bare(string) },
      { token: "number", foreground: bare(number) },
      { token: "regexp", foreground: bare(string) },
      { token: "type", foreground: bare(type) },
      { token: "type.identifier", foreground: bare(type) },
      { token: "function", foreground: bare(fn) },
      { token: "delimiter", foreground: bare(muted) },
    ],
    colors: {
      "editor.background": editorBg,
      "editor.foreground": text,
      "editorGutter.background": editorBg,
      "editorLineNumber.foreground": token("editor-line-number", "#6b7280"),
      "editorLineNumber.activeForeground": text,
      "editor.lineHighlightBackground": token("editor-line-highlight", "#f6f8fa"),
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": token("editor-selection", "#2563eb33"),
      "editor.inactiveSelectionBackground": token("accent-softer", "#2563eb1f"),
      "editorCursor.foreground": accent,
      "editorWidget.background": token("panel", "#ffffff"),
      "editorWidget.border": line,
      "editorHoverWidget.background": token("panel", "#ffffff"),
      "editorHoverWidget.border": line,
      "editorHoverWidget.foreground": text,
      "peekView.border": accent,
      "peekViewTitle.background": raised,
      "peekViewResult.background": raised,
      "peekViewResult.selectionBackground": token("accent-soft", "#2563eb1f"),
      "peekViewEditor.background": editorBg,
      "peekViewEditorGutter.background": editorBg,
      "scrollbarSlider.background": token("scrollbar", "#11182714"),
      "scrollbarSlider.hoverBackground": token("line-strong", "#11182724"),
    },
  });
}
