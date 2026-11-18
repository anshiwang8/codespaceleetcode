import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "@/components/learn/learn.module.css";

// Lesson prose, rendered on the server, so reading a lesson ships no Markdown parser to the
// browser. Same rules as the puzzle renderer (components/puzzle/Markdown.tsx): GitHub-flavored
// Markdown, raw HTML dropped, and no Mermaid (the lesson validator refuses it). Links open in the
// same tab for site paths and a new one for anything else.

export function LessonMarkdown({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div className={`${styles.prose} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a({ href, children }) {
            const external = typeof href === "string" && /^https?:\/\//.test(href);
            return external ? (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ) : (
              <a href={href}>{children}</a>
            );
          },
          table({ children }) {
            return (
              <div className={styles.tableScroll}>
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
