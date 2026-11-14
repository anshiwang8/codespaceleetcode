import styles from "@/components/learn/learn.module.css";
import { codeLines } from "@/lib/learn/code";
import type { CodeBlock } from "@/lib/learn/types";

const LANGUAGE: Record<CodeBlock["lang"], string> = { js: "JavaScript", ts: "TypeScript", py: "Python", text: "Text" };

/**
 * An original teaching snippet with line numbers, rendered on the server. No editor: lessons are
 * read, not run. The numbers are part of the layout but not the text, so copying copies the code.
 */
export function CodeBlockView({ block }: { block: CodeBlock }) {
  const lines = codeLines(block.source);
  return (
    <figure className={styles.code} data-testid={`code-${block.id}`}>
      <figcaption className={styles.codeCaption}>
        {block.file ? <span className={styles.codeFile}>{block.file}</span> : null}
        <span className={styles.codeLang}>{LANGUAGE[block.lang]}</span>
      </figcaption>
      <pre className={styles.codePre} tabIndex={0} aria-label={`${block.file ?? LANGUAGE[block.lang]} code, ${lines.length} lines`}>
        <code>
          {lines.map((line, index) => (
            <span key={index} className={styles.codeLine}>
              <span className={styles.lineNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.lineText}>{line === "" ? " " : line}</span>
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
