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

// Editor colors mirror the CSS variables in app/globals.css. Monaco needs literal hex values.
// The site has one light theme, so the editor is light whatever the system asks for.
export const LIGHT_THEME = "cb-light";

export function defineThemes(api: Pick<typeof monaco, "editor">): void {
  api.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a737d", fontStyle: "italic" },
      { token: "keyword", foreground: "cf222e" },
      { token: "string", foreground: "0a3069" },
      { token: "number", foreground: "0550ae" },
      { token: "regexp", foreground: "116329" },
      { token: "type", foreground: "953800" },
      { token: "type.identifier", foreground: "953800" },
      { token: "delimiter", foreground: "4b5563" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#111827",
      "editorGutter.background": "#ffffff",
      "editorLineNumber.foreground": "#9ca3af",
      "editorLineNumber.activeForeground": "#374151",
      "editor.lineHighlightBackground": "#f6f8fa",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#2563eb33",
      "editor.inactiveSelectionBackground": "#2563eb1f",
      "editorCursor.foreground": "#2563eb",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#d1d5db",
      "editorHoverWidget.background": "#ffffff",
      "editorHoverWidget.border": "#d1d5db",
      "peekView.border": "#2563eb",
      "peekViewTitle.background": "#f6f8fa",
      "peekViewResult.background": "#f6f8fa",
      "peekViewResult.selectionBackground": "#2563eb1f",
      "peekViewEditor.background": "#ffffff",
      "peekViewEditorGutter.background": "#ffffff",
      "scrollbarSlider.background": "#11182714",
      "scrollbarSlider.hoverBackground": "#11182724",
    },
  });
}
