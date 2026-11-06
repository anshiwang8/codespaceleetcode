"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/puzzle/markdown.module.css";
import { THEME_EVENT } from "@/lib/themes/runtime";

type Mermaid = (typeof import("mermaid"))["default"];

let loading: Promise<Mermaid> | null = null;

/**
 * Loads mermaid the first time a diagram is on the page, never on the server and never for pages
 * without one. The import is dynamic, so it's its own chunk outside the shared bundle.
 */
function loadMermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then(({ default: mermaid }) => mermaid);
  loading.catch(() => {
    // A failed chunk load shouldn't stick for the rest of the page's life.
    loading = null;
  });
  return loading;
}

/** A theme token's current value, as a color mermaid understands. */
function tokenColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return /^(#[0-9a-f]{6}|rgb\(\d{1,3} \d{1,3} \d{1,3} \/ \d{1,3}%\))$/i.test(value) ? value : fallback;
}

/**
 * Configures mermaid for the current theme. Mermaid can't read CSS variables (it computes shades
 * from these), so the theme's tokens are read and passed in before each render.
 */
function configure(mermaid: Mermaid): void {
  const dark = document.documentElement.dataset.scheme === "dark";
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    // Keys a diagram's own %%{init}%% block may not override. Without the theme and CSS keys, a
    // diagram could inject CSS, including url() requests to another host, or restyle itself.
    secure: [
      "secure",
      "securityLevel",
      "startOnLoad",
      "maxTextSize",
      "maxEdges",
      "suppressErrorRendering",
      "theme",
      "themeCSS",
      "themeVariables",
      "fontFamily",
      "altFontFamily",
    ],
    theme: "base",
    themeVariables: {
      darkMode: dark,
      background: tokenColor("bg", "#ffffff"),
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "13px",
      primaryColor: tokenColor("panel-raised", "#eff6ff"),
      primaryBorderColor: tokenColor("accent-text", "#2563eb"),
      primaryTextColor: tokenColor("text", "#0f172a"),
      secondaryColor: tokenColor("surface-sunken", "#f1f5f9"),
      tertiaryColor: tokenColor("bg", "#ffffff"),
      lineColor: tokenColor("text-muted", "#64748b"),
      textColor: tokenColor("text", "#0f172a"),
      noteBkgColor: tokenColor("panel-raised", "#fefce8"),
      noteBorderColor: tokenColor("warn", "#ca8a04"),
      noteTextColor: tokenColor("text", "#0f172a"),
      actorBkg: tokenColor("panel-raised", "#eff6ff"),
      actorBorder: tokenColor("accent-text", "#2563eb"),
      actorTextColor: tokenColor("text", "#0f172a"),
      signalColor: tokenColor("text-muted", "#334155"),
      signalTextColor: tokenColor("text", "#0f172a"),
      labelTextColor: tokenColor("text", "#0f172a"),
    },
    // Without this, a diagram that doesn't parse leaves mermaid's own error graphic in the page.
    suppressErrorRendering: true,
    // Diagrams keep their natural size. The prompt panel is narrow, so scaling them to fit made the
    // text unreadable. They scroll sideways instead, and Expand shows them large.
    flowchart: { useMaxWidth: false },
    sequence: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
  });
}

let nextId = 0;

type Rendered = { state: "ready"; svg: string } | { state: "error" };
type DiagramState = { state: "loading" } | Rendered;

async function renderDiagram(source: string): Promise<Rendered> {
  // Each call gets its own id, which mermaid uses for the SVG and for the styles scoped to it.
  nextId += 1;
  const id = `mermaid-diagram-${nextId}`;
  try {
    const mermaid = await loadMermaid();
    configure(mermaid);
    const { svg } = await mermaid.render(id, source);
    return { state: "ready", svg };
  } catch {
    return { state: "error" };
  } finally {
    // mermaid removes its scratch element on success, but not always when parsing fails.
    document.getElementById(`d${id}`)?.remove();
  }
}

/**
 * One fenced ```mermaid block. Rendered once per theme; if it fails, its source is shown instead. A
 * theme change redraws it in the new colors.
 */
export function MermaidDiagram({ source }: { source: string }) {
  const [diagram, setDiagram] = useState<DiagramState>({ state: "loading" });
  const [themeVersion, setThemeVersion] = useState(0);
  // Kept across React's development double-run of effects, so each diagram is rendered once.
  const rendering = useRef<{ key: string; result: Promise<Rendered> } | null>(null);

  useEffect(() => {
    const redraw = () => setThemeVersion((version) => version + 1);
    window.addEventListener(THEME_EVENT, redraw);
    return () => window.removeEventListener(THEME_EVENT, redraw);
  }, []);

  useEffect(() => {
    let canceled = false;
    const key = `${themeVersion}:${source}`;
    if (rendering.current?.key !== key) {
      rendering.current = { key, result: renderDiagram(source) };
    }
    void rendering.current.result.then((result) => {
      if (!canceled) setDiagram(result);
    });
    return () => {
      canceled = true;
    };
  }, [source, themeVersion]);

  if (diagram.state === "ready") {
    return <ReadyDiagram svg={diagram.svg} />;
  }

  if (diagram.state === "loading") {
    return (
      <div className={styles.diagram} data-testid="mermaid-diagram" data-state="loading">
        <p className={styles.diagramNote}>Drawing the diagram…</p>
      </div>
    );
  }

  return (
    <div className={styles.diagramFallback} data-testid="mermaid-diagram" data-state="error">
      <p className={styles.diagramNote} data-testid="mermaid-error">
        Diagram failed to render. Its source is below.
      </p>
      <pre>
        <code>{source}</code>
      </pre>
    </div>
  );
}

/** A drawn diagram at its natural size, scrolling sideways in the panel, with a full-size view. */
function ReadyDiagram({ svg }: { svg: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);

  const open = () => {
    setExpanded(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <div className={styles.diagramBox}>
      <button type="button" className={styles.diagramExpand} onClick={open} data-testid="mermaid-expand">
        Expand
      </button>
      <div
        className={styles.diagram}
        data-testid="mermaid-diagram"
        data-state="ready"
        // The SVG comes from mermaid with securityLevel "strict", which sanitizes every label.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <dialog
        ref={dialog}
        className={styles.diagramDialog}
        aria-label="Diagram"
        data-testid="mermaid-dialog"
        onClose={() => setExpanded(false)}
        // A click on the backdrop lands on the dialog itself, outside its content.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className={styles.diagramDialogBar}>
          <button type="button" className="btn btn-small" onClick={close} autoFocus>
            Close
          </button>
        </div>
        {/* Only drawn while open, so the page doesn't carry a second copy of every diagram. */}
        {expanded ? <div className={styles.diagramDialogBody} dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      </dialog>
    </div>
  );
}
