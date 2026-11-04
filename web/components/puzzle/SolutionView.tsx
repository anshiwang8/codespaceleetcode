"use client";

import { useEffect, useState } from "react";
import { Markdown } from "@/components/puzzle/Markdown";
import styles from "@/components/puzzle/puzzle.module.css";
import { ApiRequestError, api } from "@/lib/client/api";

type SolutionState = { state: "loading" } | { state: "ready"; body: string } | { state: "error"; message: string };

/**
 * Mounted only once the puzzle is solved and the Solution tab has been opened, then kept for the
 * page's life, so the solution is fetched once. The server checks the unlock again.
 */
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
    <div className={styles.solution} data-testid="solution" data-state={solution.state}>
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
      {/* The renderer keeps skipHtml, which drops raw HTML in the markdown entirely. */}
      {solution.state === "ready" ? <Markdown source={solution.body} /> : null}
    </div>
  );
}
