"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import styles from "@/components/settings/settings.module.css";
import { useUnsavedChanges, type SaveState } from "@/components/settings/useUnsavedChanges";
import type { ProfileDetails } from "@/lib/api-types";
import { ApiRequestError, api } from "@/lib/client/api";
import { LIMITS } from "@/lib/profile-fields";
import { Icon } from "@/components/site/Icon";

type Draft = { displayName: string; pronouns: string; bio: string; birthday: string };

const toDraft = (details: ProfileDetails): Draft => ({
  displayName: details.displayName ?? "",
  pronouns: details.pronouns ?? "",
  bio: details.bio ?? "",
  birthday: details.birthday ?? "",
});

/** Optional details. Every field can be left empty or cleared; nothing here is required. */
export function DetailsForm({ initial }: { initial: ProfileDetails }) {
  const { me, updateAccount } = useAuth();
  const [saved, setSaved] = useState<Draft>(toDraft(initial));
  const [draft, setDraft] = useState<Draft>(toDraft(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsavedChanges(dirty);

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft({ ...draft, [key]: event.target.value });
      if (state.kind !== "pending") setState({ kind: "idle" });
    },
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `details-${key}-error` : `details-${key}-hint`,
    id: `details-${key}`,
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: "pending" });
    setErrors({});
    // The account this save is for, so its result never lands on someone who signed in since.
    const login = me?.user?.login ?? "";
    try {
      const result = await api.saveDetails({
        displayName: draft.displayName,
        pronouns: draft.pronouns,
        bio: draft.bio,
        birthday: draft.birthday === "" ? null : draft.birthday,
      });
      const next = toDraft(result);
      setSaved(next);
      setDraft(next);
      setState({ kind: "saved", text: "Saved." });
      updateAccount(login, { displayName: result.displayName });
    } catch (caught) {
      // The entered values stay, so nothing typed is lost.
      if (caught instanceof ApiRequestError && Object.keys(caught.fields).length > 0) setErrors(caught.fields);
      setState({
        kind: "error",
        text: caught instanceof ApiRequestError ? caught.message : "Couldn't save. Check your connection and try again.",
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const error = (key: keyof Draft) =>
    errors[key] ? (
      <p id={`details-${key}-error`} className={styles.fieldError}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <form className={styles.form} onSubmit={(event) => void save(event)} noValidate data-testid="details-form">
      <div className={styles.field}>
        <label htmlFor="details-displayName" className="field-label">
          Display name
        </label>
        <input className="input" maxLength={LIMITS.displayName * 2} autoComplete="nickname" {...field("displayName")} />
        <p id="details-displayName-hint" className={styles.hint}>
          Shown on your profile instead of your GitHub username. Your username and sign-in don&apos;t change.
        </p>
        {error("displayName")}
      </div>
      <div className={styles.field}>
        <label htmlFor="details-pronouns" className="field-label">
          Pronouns
        </label>
        <input className="input" maxLength={LIMITS.pronouns * 2} {...field("pronouns")} />
        <p id="details-pronouns-hint" className={styles.hint}>
          Only if you&apos;d like to. Up to {LIMITS.pronouns} characters.
        </p>
        {error("pronouns")}
      </div>
      <div className={styles.field}>
        <label htmlFor="details-bio" className="field-label">
          Short bio
        </label>
        <textarea className="input" rows={3} maxLength={LIMITS.bio * 2} {...field("bio")} />
        <p id="details-bio-hint" className={styles.hint} aria-live="polite">
          {[...draft.bio.trim()].length} of {LIMITS.bio} characters.
        </p>
        {error("bio")}
      </div>
      <div className={styles.field}>
        <label htmlFor="details-birthday" className="field-label">
          Birthday
        </label>
        <div className={styles.inline}>
          <input type="date" className={`input ${styles.date}`} min="1900-01-01" max={today} {...field("birthday")} />
          {draft.birthday ? (
            <button type="button" className="btn btn-small btn-quiet" onClick={() => setDraft({ ...draft, birthday: "" })}>
              Clear
            </button>
          ) : null}
        </div>
        <p id="details-birthday-hint" className={styles.hint}>
          Private. Stored as a date only; codebases never shows an age or uses it for anything else.
        </p>
        {error("birthday")}
      </div>
      <FormActions dirty={dirty} state={state} onCancel={() => {
        setDraft(saved);
        setErrors({});
        setState({ kind: "idle" });
      }} testId="details" />
    </form>
  );
}

export function FormActions({
  dirty,
  state,
  onCancel,
  testId,
}: {
  dirty: boolean;
  state: SaveState;
  onCancel: () => void;
  testId: string;
}) {
  return (
    <div className={styles.actions}>
      <button
        type="submit"
        className="btn btn-primary pending-track"
        disabled={!dirty || state.kind === "pending"}
        aria-busy={state.kind === "pending"}
        data-testid={`${testId}-save`}
      >
        {state.kind === "pending" ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn" onClick={onCancel} disabled={!dirty || state.kind === "pending"} data-testid={`${testId}-cancel`}>
        Cancel
      </button>
      <p
        className={state.kind === "error" ? styles.saveError : state.kind === "saved" ? styles.saveDone : styles.saveNote}
        role={state.kind === "error" ? "alert" : "status"}
        data-testid={`${testId}-status`}
      >
        {state.kind === "saved" ? <Icon name="check" /> : null}
        {state.kind === "saved" || state.kind === "error" ? state.text : dirty ? "Unsaved changes." : ""}
      </p>
    </div>
  );
}
