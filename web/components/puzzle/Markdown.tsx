"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "@/components/puzzle/MermaidDiagram";
import styles from "@/components/puzzle/markdown.module.css";

/** Just the parts of a hast node this file reads. */
interface HastLike {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastLike[];
}

function textOf(node: HastLike): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

/** The source of a fenced ```mermaid block, or null when this <pre> is any other code block. */
function mermaidSource(pre: HastLike | undefined): string | null {
  const code = pre?.children?.find((child) => child.type === "element");
  if (!code || code.tagName !== "code") return null;
  const className = code.properties?.className;
  const classes = Array.isArray(className) ? className : [];
  if (!classes.includes("language-mermaid")) return null;
  return textOf(code).replace(/\n$/, "");
}

const COMPONENTS: Components = {
  pre({ node, children, ...rest }) {
    const source = mermaidSource(node);
    if (source !== null) return <MermaidDiagram source={source} />;
    return <pre {...rest}>{children}</pre>;
  },
  table({ children }) {
    // Wide tables scroll inside their own box instead of widening the panel.
    return (
      <div className={styles.tableScroll}>
        <table>{children}</table>
      </div>
    );
  },
};

interface MarkdownProps {
  source: string;
  className?: string;
  testId?: string;
}

/**
 * The one markdown renderer for prompts, hints and solutions: GitHub-flavored markdown, with
 * fenced mermaid blocks drawn as diagrams. skipHtml drops raw HTML in the source entirely.
 */
export function Markdown({ source, className, testId }: MarkdownProps) {
  return (
    <div className={className ? `${styles.markdown} ${className}` : styles.markdown} data-testid={testId}>
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
