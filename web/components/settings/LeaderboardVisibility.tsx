"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "@/components/settings/settings.module.css";
import { useUnsavedChanges, type SaveState } from "@/components/settings/useUnsavedChanges";
import { Icon } from "@/components/site/Icon";
import type { LeaderboardParticipation } from "@/lib/api-types";
import { formatDate } from "@/lib/format";
import { PUBLIC_NAME_MAX, PUBLIC_NAME_MIN, publicNameField } from "@/lib/leaderboard-name";

type Outcome =
  | { ok: true; participation: LeaderboardParticipation }
  | { ok: false; message: string; field: string | null };

/** PUT or DELETE /api/me/leaderboard. Field errors (400, and 409 for a taken name) come back by field. */
async function change(method: "PUT" | "DELETE", publicName?: string): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch("/api/me/leaderboard", {
      method,
      ...(publicName === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicName }) }),
    });
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check your connection and try again.", field: null };
  }
  const body = (await response.json().catch(() => null)) as
    | (Partial<LeaderboardParticipation> & { error?: string; fields?: { publicName?: string } })
    | null;
  if (response.ok && body && typeof body.participating === "boolean") {
    return {
      ok: true,
      participation: {
        participating: body.participating,
        publicName: body.publicName ?? null,
        joinedAt: body.joinedAt ?? null,
      },
    };
  }
  return {
    ok: false,
    message: body?.error ?? "Couldn't save. Try again.",
    field: typeof body?.fields?.publicName === "string" ? body.fields.publicName : null,
  };
}

/**
 * Whether the user appears on the leaderboard, and under which public name. Off by default:
 * joining is the only thing that puts anyone there, and leaving removes the entry while the points
 * stay on the account, visible only to its owner.
 */
export function LeaderboardVisibility({ initial }: { initial: LeaderboardParticipation }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial.publicName ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [leaving, setLeaving] = useState(false);

  const joined = saved.participating;
  const dirty = joined ? draft !== (saved.publicName ?? "") : draft.trim() !== "";
  useUnsavedChanges(dirty);
  const busy = state.kind === "pending" || leaving;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    // The same rules the server applies, so a mistake shows before a round trip.
    const checked = publicNameField(draft);
    if (!checked.ok) {
      setFieldError(checked.error);
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "pending" });
    const result = await change("PUT", checked.value);
    if (result.ok) {
      setSaved(result.participation);
      setDraft(result.participation.publicName ?? "");
      setState({ kind: "saved", text: joined ? "Saved." : "Joined. You're on the leaderboard." });
    } else {
      setFieldError(result.field);
      setState({ kind: "error", text: result.field ? "Nothing was saved." : result.message });
    }
  }

  async function leave() {
    setLeaving(true);
    setFieldError(null);
    setState({ kind: "idle" });
    const result = await change("DELETE");
    setLeaving(false);
    if (result.ok) {
      setSaved(result.participation);
      setDraft("");
      setState({ kind: "saved", text: "You've left the leaderboard. Your points are private again." });
    } else {
      setState({ kind: "error", text: result.message });
    }
  }

  const describedBy = fieldError ? "public-name-error public-name-hint" : "public-name-hint";

  return (
    <div className={styles.visibility} data-testid="leaderboard-visibility">
      <p className={styles.visibilityState} data-testid="leaderboard-visibility-state">
        {joined ? (
          <>
            <span className="badge badge-ok">
              <Icon name="check" /> On the leaderboard
            </span>
            <span className={styles.hint}>
              As <strong className={styles.publicName}>{saved.publicName}</strong>
              {saved.joinedAt ? `, since ${formatDate(saved.joinedAt)}` : ""}.{" "}
              <Link href="/leaderboard">See the leaderboard</Link>
            </span>
          </>
        ) : (
          <>
            <span className="badge">
              <Icon name="lock" /> Not on the leaderboard
            </span>
            <span className={styles.hint}>Your points are private. Only you can see them.</span>
          </>
        )}
      </p>

      <p className={styles.hint}>
        Joining shows a public name you choose, with your points, the puzzles you&apos;ve solved and when you reached
        your total. It never shows your GitHub username, display name, email or picture.
      </p>

      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate data-testid="leaderboard-form">
        <div className={styles.field}>
          <label htmlFor="public-name" className="field-label">
            Public name
          </label>
          <input
            id="public-name"
            className="input"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setFieldError(null);
              if (state.kind !== "pending") setState({ kind: "idle" });
            }}
            maxLength={PUBLIC_NAME_MAX * 2}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy}
            data-testid="public-name-input"
          />
          <p id="public-name-hint" className={styles.hint}>
            {PUBLIC_NAME_MIN} to {PUBLIC_NAME_MAX} characters: letters, numbers, spaces and . _ - &apos;. Everyone
            can see it, so don&apos;t use your GitHub username or real name unless you want them public.
          </p>
          {fieldError ? (
            <p id="public-name-error" className={styles.fieldError} data-testid="public-name-error">
              {fieldError}
            </p>
          ) : null}
        </div>
        <div className={styles.actions}>
          <button
            type="submit"
            className="btn btn-primary pending-track"
            disabled={busy || !dirty}
            aria-busy={state.kind === "pending"}
            data-testid="leaderboard-save"
          >
            {state.kind === "pending" ? (joined ? "Saving…" : "Joining…") : joined ? "Save name" : "Join the leaderboard"}
          </button>
          {dirty ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setDraft(saved.publicName ?? "");
                setFieldError(null);
                setState({ kind: "idle" });
              }}
              data-testid="leaderboard-cancel"
            >
              Cancel
            </button>
          ) : null}
          <p
            className={state.kind === "error" ? styles.saveError : state.kind === "saved" ? styles.saveDone : styles.saveNote}
            role={state.kind === "error" ? "alert" : "status"}
            data-testid="leaderboard-status"
          >
            {state.kind === "saved" ? <Icon name="check" /> : null}
            {state.kind === "saved" || state.kind === "error"
              ? state.text
              : dirty && joined
                ? "Unsaved changes."
                : ""}
          </p>
        </div>
      </form>

      {joined ? (
        <div className={styles.leave}>
          <div>
            <h3 className={styles.subheading}>Leave the leaderboard</h3>
            <p className={styles.hint}>
              Removes your entry and public name. Your points stay on your account, visible only to you.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-small pending-track"
            onClick={() => void leave()}
            disabled={busy}
            aria-busy={leaving}
            data-testid="leaderboard-leave"
          >
            {leaving ? "Leaving…" : "Leave the leaderboard"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
