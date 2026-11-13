"use client";

import { useId, useState } from "react";
import styles from "@/components/learn/learn.module.css";
import { InlineText } from "@/components/learn/InlineText";
import { ApiRequestError, api } from "@/lib/client/api";

/**
 * The capstone's optional explanation. What the learner writes stays in this page: it isn't
 * sent, stored or graded. The rubric comes from the server only when they ask for it.
 */
export function Reflection({ slug, revision, prompt }: { slug: string; revision: number; prompt: React.ReactNode }) {
  const id = useId();
  const [text, setText] = useState("");
  const [rubric, setRubric] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function show() {
    setBusy(true);
    setError(null);
    try {
      const response = await api.learnRubric(slug, revision);
      setRubric(response.rubric.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "The rubric couldn't be loaded. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.exercise} aria-labelledby={`${id}-title`} data-testid="reflection">
      <div className={styles.exerciseHead}>
        <h3 id={`${id}-title`} className={styles.exerciseTitle}>
          Optional explanation
        </h3>
        <span className={styles.exerciseRole}>Self-check, never graded</span>
      </div>
      <div className={styles.exercisePrompt}>{prompt}</div>
      <label className={styles.reflectionField}>
        <span className="field-label">Your explanation (stays on this page; it isn&apos;t saved or sent)</span>
        <textarea className="input" rows={5} value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} />
      </label>
      <div className={styles.exerciseActions}>
        {rubric ? null : (
          <button type="button" className="btn" onClick={() => void show()} disabled={busy} aria-busy={busy} data-testid="show-rubric">
            Compare with the rubric
          </button>
        )}
      </div>
      {error ? <p className="notice notice-error">{error}</p> : null}
      {rubric ? (
        <div className={styles.revealed} data-testid="rubric">
          {rubric.map((paragraph, index) => (
            <p key={index}>
              <InlineText text={paragraph} />
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
