"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/puzzle/markdown.module.css";

type Mermaid = (typeof import("mermaid"))["default"];

let loading: Promise<Mermaid> | null = null;

/**
 * Loads mermaid the first time a diagram is on the page, never on the server and never for pages
 * without one. The import is dynamic, so it's its own chunk outside the shared bundle.
 */
function loadMermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then(({ default: mermaid }) => {
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
      // Mermaid can't read CSS variables, since it works its colours out from these, so they're
      // written out: a light theme for a white page with the site's blue accent.
      theme: "base",
      themeVariables: {
        background: "#ffffff",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: "13px",
        primaryColor: "#eff6ff",
        primaryBorderColor: "#2563eb",
        primaryTextColor: "#0f172a",
        secondaryColor: "#f1f5f9",
        tertiaryColor: "#ffffff",
        lineColor: "#64748b",
        textColor: "#0f172a",
        noteBkgColor: "#fefce8",
        noteBorderColor: "#ca8a04",
        actorBkg: "#eff6ff",
        actorBorder: "#2563eb",
        signalColor: "#334155",
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
    return mermaid;
  });
  loading.catch(() => {
    // A failed chunk load shouldn't stick for the rest of the page's life.
    loading = null;
  });
  return loading;
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
    const { svg } = await mermaid.render(id, source);
    return { state: "ready", svg };
  } catch {
    return { state: "error" };
  } finally {
    // mermaid removes its scratch element on success, but not always when parsing fails.
    document.getElementById(`d${id}`)?.remove();
  }
}

/** One fenced ```mermaid block. Rendered once; if it fails, its source is shown instead. */
export function MermaidDiagram({ source }: { source: string }) {
  const [diagram, setDiagram] = useState<DiagramState>({ state: "loading" });
  // Kept across React's development double-run of effects, so each diagram is rendered once.
  const rendering = useRef<{ source: string; result: Promise<Rendered> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (rendering.current?.source !== source) {
      rendering.current = { source, result: renderDiagram(source) };
    }
    void rendering.current.result.then((result) => {
      if (!cancelled) setDiagram(result);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

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
