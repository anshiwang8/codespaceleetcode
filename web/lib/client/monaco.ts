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

// Editor colours mirror the CSS variables in app/globals.css. Monaco needs literal hex values.
export const DARK_THEME = "cp-dark";
export const LIGHT_THEME = "cp-light";

export function defineThemes(api: Pick<typeof monaco, "editor">): void {
  api.editor.defineTheme(DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7d858e", fontStyle: "italic" },
      { token: "keyword", foreground: "c9a0dc" },
      { token: "string", foreground: "9ccc9c" },
      { token: "number", foreground: "e0b080" },
      { token: "type", foreground: "8fc7d8" },
      { token: "type.identifier", foreground: "8fc7d8" },
      { token: "delimiter", foreground: "a8b0b8" },
    ],
    colors: {
      "editor.background": "#101316",
      "editor.foreground": "#d7dbe0",
      "editorLineNumber.foreground": "#59616a",
      "editorLineNumber.activeForeground": "#aeb5bc",
      "editor.lineHighlightBackground": "#171b1f",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#e5b56740",
      "editor.inactiveSelectionBackground": "#e5b56726",
      "editorCursor.foreground": "#e5b567",
      "editorWidget.background": "#181c20",
      "editorWidget.border": "#2c3238",
      "editorHoverWidget.background": "#181c20",
      "editorHoverWidget.border": "#2c3238",
      "peekView.border": "#e5b567",
      "peekViewResult.background": "#14171a",
      "peekViewEditor.background": "#101316",
      "scrollbarSlider.background": "#ffffff14",
      "scrollbarSlider.hoverBackground": "#ffffff24",
    },
  });
  api.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7078", fontStyle: "italic" },
      { token: "keyword", foreground: "7a3e9d" },
      { token: "string", foreground: "2e6e3e" },
      { token: "number", foreground: "a0522d" },
      { token: "type", foreground: "1f6b82" },
      { token: "type.identifier", foreground: "1f6b82" },
    ],
    colors: {
      "editor.background": "#fdfcfa",
      "editor.foreground": "#24272b",
      "editorLineNumber.foreground": "#a3a6aa",
      "editorLineNumber.activeForeground": "#4f5358",
      "editor.lineHighlightBackground": "#f3f1ec",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#c98f2a40",
      "editor.inactiveSelectionBackground": "#c98f2a26",
      "editorCursor.foreground": "#8a5a00",
      "peekView.border": "#8a5a00",
    },
  });
}
