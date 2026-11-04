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
      flowchart: { useMaxWidth: true },
      sequence: { useMaxWidth: true },
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
    return (
      <div
        className={styles.diagram}
        data-testid="mermaid-diagram"
        data-state="ready"
        // The SVG comes from mermaid with securityLevel "strict", which sanitizes every label.
        dangerouslySetInnerHTML={{ __html: diagram.svg }}
      />
    );
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
