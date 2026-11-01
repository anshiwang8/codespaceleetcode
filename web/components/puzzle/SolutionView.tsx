"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import styles from "@/components/puzzle/puzzle.module.css";
import { ApiRequestError, api } from "@/lib/client/api";

type SolutionState = { state: "loading" } | { state: "ready"; body: string } | { state: "error"; message: string };

/** Mounted only once the puzzle is solved or given up. The server checks that again. */
export function SolutionView({ slug }: { slug: string }) {
  const [solution, setSolution] = useState<SolutionState>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.solution(slug).then(
      (response) => {
        if (!cancelled) setSolution({ state: "ready", body: response.bodyMd });
      },
      (error: unknown) => {
        if (cancelled) return;
        setSolution({
          state: "error",
          message: error instanceof ApiRequestError ? error.message : "The solution couldn't be loaded.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  return (
    <div className={styles.solution} data-testid="solution">
      <h2>Solution</h2>
      {solution.state === "loading" ? <p className="muted">Loading the solution…</p> : null}
      {solution.state === "error" ? (
        <div className="notice notice-error" role="alert">
          <p>{solution.message}</p>
          <button
            type="button"
            className="btn btn-small"
            style={{ marginTop: 6 }}
            onClick={() => {
              setSolution({ state: "loading" });
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      {solution.state === "ready" ? (
        <div className={styles.markdown}>
          {/* skipHtml drops raw HTML in the markdown entirely, on top of react-markdown's default. */}
          <ReactMarkdown skipHtml>{solution.body}</ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}
