"use client";

import { useState } from "react";
import { FormActions } from "@/components/settings/DetailsForm";
import { LinkMark } from "@/components/settings/LinkMark";
import styles from "@/components/settings/settings.module.css";
import { useUnsavedChanges, type SaveState } from "@/components/settings/useUnsavedChanges";
import type { ProfileLinks } from "@/lib/api-types";
import { ApiRequestError, api } from "@/lib/client/api";
import { LIMITS, LINK_EXAMPLES, LINK_LABELS, LINK_PLATFORMS, type LinkPlatform } from "@/lib/profile-fields";

type Draft = Record<LinkPlatform, string> & { custom: { label: string; url: string }[] };

const toDraft = (links: ProfileLinks): Draft => ({
  linkedin: links.linkedin ?? "",
  github: links.github ?? "",
  website: links.website ?? "",
  x: links.x ?? "",
  bluesky: links.bluesky ?? "",
  mastodon: links.mastodon ?? "",
  custom: links.custom.map((entry) => ({ ...entry })),
});

/**
 * Optional links. None are verified: they're links the user typed, shown on their own private
 * profile. The GitHub link is separate from the GitHub account used to sign in.
 */
export function LinksForm({ initial }: { initial: ProfileLinks }) {
  const [saved, setSaved] = useState<Draft>(toDraft(initial));
  const [draft, setDraft] = useState<Draft>(toDraft(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useUnsavedChanges(dirty);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: "pending" });
    setErrors({});
    try {
      const result = await api.saveLinks({
        ...Object.fromEntries(LINK_PLATFORMS.map((platform) => [platform, draft[platform]])),
        custom: draft.custom.filter((entry) => entry.label.trim() !== "" || entry.url.trim() !== ""),
      });
      const next = toDraft(result);
      setSaved(next);
      setDraft(next);
      setState({ kind: "saved", text: "Saved." });
    } catch (caught) {
      if (caught instanceof ApiRequestError && Object.keys(caught.fields).length > 0) setErrors(caught.fields);
      setState({
        kind: "error",
        text: caught instanceof ApiRequestError ? caught.message : "Couldn't save. Check your connection and try again.",
      });
    }
  }

  const updateCustom = (index: number, part: "label" | "url", value: string) =>
    setDraft({ ...draft, custom: draft.custom.map((entry, at) => (at === index ? { ...entry, [part]: value } : entry)) });

  return (
    <form className={styles.form} onSubmit={(event) => void save(event)} noValidate data-testid="links-form">
      <p className={styles.hint}>
        All optional. Links must start with https://. They&apos;re shown only on your own profile, and aren&apos;t
        checked or verified. Your GitHub link here doesn&apos;t change the GitHub account you sign in with.
      </p>
      {LINK_PLATFORMS.map((platform) => (
        <div key={platform} className={styles.field}>
          <label htmlFor={`link-${platform}`} className={`field-label ${styles.linkLabel}`}>
            <LinkMark platform={platform} />
            {LINK_LABELS[platform]}
          </label>
          <div className={styles.inline}>
            <input
              id={`link-${platform}`}
              className="input"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder={LINK_EXAMPLES[platform]}
              value={draft[platform]}
              onChange={(event) => setDraft({ ...draft, [platform]: event.target.value })}
              aria-invalid={errors[platform] ? true : undefined}
              aria-describedby={errors[platform] ? `link-${platform}-error` : undefined}
              data-testid={`link-${platform}`}
            />
            {draft[platform] ? (
              <button
                type="button"
                className="btn btn-small btn-quiet"
                onClick={() => setDraft({ ...draft, [platform]: "" })}
                aria-label={`Remove ${LINK_LABELS[platform]} link`}
              >
                Remove
              </button>
            ) : null}
          </div>
          {errors[platform] ? (
            <p id={`link-${platform}-error`} className={styles.fieldError}>
              {errors[platform]}
            </p>
          ) : null}
        </div>
      ))}

      <fieldset className={styles.custom}>
        <legend className="field-label">Other links</legend>
        {draft.custom.map((entry, index) => (
          <div key={index} className={styles.customRow} data-testid="custom-link">
            <div className={styles.field}>
              <label htmlFor={`custom-label-${index}`} className="field-label">
                Label
              </label>
              <input
                id={`custom-label-${index}`}
                className="input"
                maxLength={LIMITS.linkLabel * 2}
                value={entry.label}
                onChange={(event) => updateCustom(index, "label", event.target.value)}
                aria-invalid={errors[`custom.${index}.label`] ? true : undefined}
                aria-describedby={errors[`custom.${index}.label`] ? `custom-label-${index}-error` : undefined}
              />
              {errors[`custom.${index}.label`] ? (
                <p id={`custom-label-${index}-error`} className={styles.fieldError}>
                  {errors[`custom.${index}.label`]}
                </p>
              ) : null}
            </div>
            <div className={styles.field}>
              <label htmlFor={`custom-url-${index}`} className="field-label">
                Link
              </label>
              <input
                id={`custom-url-${index}`}
                className="input"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={entry.url}
                onChange={(event) => updateCustom(index, "url", event.target.value)}
                aria-invalid={errors[`custom.${index}.url`] ? true : undefined}
                aria-describedby={errors[`custom.${index}.url`] ? `custom-url-${index}-error` : undefined}
              />
              {errors[`custom.${index}.url`] ? (
                <p id={`custom-url-${index}-error`} className={styles.fieldError}>
                  {errors[`custom.${index}.url`]}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-small btn-quiet"
              onClick={() => setDraft({ ...draft, custom: draft.custom.filter((_, at) => at !== index) })}
              aria-label={`Remove link ${index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        {draft.custom.length < LIMITS.customLinks ? (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => setDraft({ ...draft, custom: [...draft.custom, { label: "", url: "" }] })}
            data-testid="add-custom-link"
          >
            Add a link
          </button>
        ) : (
          <p className={styles.hint}>Up to {LIMITS.customLinks} other links.</p>
        )}
      </fieldset>
      <FormActions
        dirty={dirty}
        state={state}
        onCancel={() => {
          setDraft(saved);
          setErrors({});
          setState({ kind: "idle" });
        }}
        testId="links"
      />
    </form>
  );
}
