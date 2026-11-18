"use client";

import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import styles from "@/components/themes/themes.module.css";
import {
  cancelPreview,
  commit,
  getState,
  loadCatalog,
  preview,
  subscribe,
  type AppearanceState,
} from "@/lib/themes/controller";
import { DEFAULT_PREFERENCE, SYSTEM_THEMES, type ThemePreference } from "@/lib/themes/runtime";
import { DEFAULT_LIGHT_ID, type ThemeDefinition } from "@/lib/themes/tokens";
import { Icon } from "@/components/site/Icon";

const SERVER_STATE: AppearanceState = { committed: DEFAULT_PREFERENCE, previewing: null, scope: "guest" };
const keyOf = (preference: ThemePreference) => (preference.mode === "system" ? "system" : preference.id);

interface ThemePickerProps {
  /** "dialog" is the compact header version, which closes after Apply or Cancel. */
  variant: "page" | "dialog";
  onClose?: () => void;
}

/**
 * Picks a theme from a grid of swatches: System, then every theme in the catalog. The options are
 * one group of radios, so the arrow keys move between them. Choosing one previews it on the whole page without saving; Apply saves it (to the
 * account when signed in, to this browser otherwise), and Cancel goes back to the saved theme.
 * Leaving without applying cancels the preview too.
 */
export function ThemePicker({ variant, onClose }: ThemePickerProps) {
  const appearance = useSyncExternalStore(subscribe, getState, () => SERVER_STATE);
  const [themes, setThemes] = useState<readonly ThemeDefinition[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [candidate, setCandidate] = useState<ThemePreference>(appearance.committed);
  const [status, setStatus] = useState<{ kind: "saved" | "error" | "pending"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    loadCatalog().then(
      (loaded) => active && setThemes(loaded),
      () => active && setLoadError(true),
    );
    return () => {
      active = false;
      // Leaving without Apply puts the saved theme back.
      void cancelPreview();
    };
  }, []);

  // The saved theme can change elsewhere (another tab's sign-in, the header picker).
  const committedKey = keyOf(appearance.committed);
  const [seenCommitted, setSeenCommitted] = useState(committedKey);
  if (seenCommitted !== committedKey && !appearance.previewing) {
    setSeenCommitted(committedKey);
    setCandidate(appearance.committed);
  }

  const byId = useMemo(() => new Map((themes ?? []).map((theme) => [theme.id, theme])), [themes]);
  const systemSwatches = useMemo(() => [byId.get(SYSTEM_THEMES.light), byId.get(SYSTEM_THEMES.dark)], [byId]);

  // Stable, so choosing a theme re-renders only the two options whose checked state changed.
  const choose = useCallback((next: ThemePreference) => {
    setCandidate(next);
    setStatus(null);
    void preview(next);
  }, []);
  const chooseValue = useCallback(
    (value: string) => choose(value === "system" ? { mode: "system" } : { mode: "theme", id: value }),
    [choose],
  );

  const apply = async (next: ThemePreference = candidate) => {
    setStatus({ kind: "pending", text: "Saving…" });
    try {
      await commit(next);
      setCandidate(next);
      setStatus({ kind: "saved", text: appearance.scope === "account" ? "Saved to your account." : "Saved in this browser." });
      if (variant === "dialog") onClose?.();
    } catch (error) {
      setCandidate(appearance.committed);
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Couldn't save your theme." });
    }
  };

  const cancel = () => {
    void cancelPreview();
    setCandidate(appearance.committed);
    setStatus(null);
    onClose?.();
  };

  const candidateKey = keyOf(candidate);
  const dirty = candidateKey !== committedKey;
  const candidateTheme =
    candidate.mode === "system"
      ? byId.get(typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? SYSTEM_THEMES.dark : SYSTEM_THEMES.light)
      : byId.get(candidate.id);
  const candidateName = candidate.mode === "system" ? "System" : (candidateTheme?.name ?? "this theme");

  return (
    <div className={`${styles.picker} ${variant === "dialog" ? styles.dialogPicker : ""}`} data-testid="theme-picker">
      <div className={styles.body}>
        <div className={styles.list} role="radiogroup" aria-label="Themes" data-testid="theme-list">
          {loadError ? (
            <p className="notice notice-error">The theme list couldn&apos;t be loaded. Reload the page to try again.</p>
          ) : !themes ? (
            <p className="muted" role="status">
              Loading themes…
            </p>
          ) : (
            <>
              <ThemeOption
                name={`theme-${variant}`}
                value="system"
                label="System"
                detail="Follows this device"
                checked={candidateKey === "system"}
                saved={committedKey === "system"}
                swatches={systemSwatches}
                onChoose={chooseValue}
              />
              {themes.map((theme) => (
                <ThemeOption
                  key={theme.id}
                  name={`theme-${variant}`}
                  value={theme.id}
                  label={theme.name}
                  detail={theme.id === DEFAULT_LIGHT_ID ? "Default" : theme.scheme === "dark" ? "Dark" : "Light"}
                  checked={candidateKey === theme.id}
                  saved={committedKey === theme.id}
                  theme={theme}
                  onChoose={chooseValue}
                />
              ))}
            </>
          )}
        </div>

        <div className={styles.side}>
          {candidateTheme ? <ThemePreview theme={candidateTheme} label={candidateName} /> : null}
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void apply()}
              disabled={!dirty || status?.kind === "pending"}
              data-testid="theme-apply"
            >
              Apply
            </button>
            <button type="button" className="btn" onClick={cancel} data-testid="theme-cancel">
              {variant === "dialog" ? "Cancel" : "Cancel preview"}
            </button>
          </div>
          <button
            type="button"
            className="btn btn-small btn-quiet"
            onClick={() => {
              setCandidate(DEFAULT_PREFERENCE);
              void apply(DEFAULT_PREFERENCE);
            }}
            disabled={committedKey === DEFAULT_LIGHT_ID && candidateKey === DEFAULT_LIGHT_ID}
            data-testid="theme-restore"
          >
            Restore default
          </button>
          {status ? (
            <p
              className={status.kind === "error" ? "notice notice-error" : styles.status}
              role={status.kind === "error" ? "alert" : "status"}
              data-testid="theme-status"
            >
              {status.text}
            </p>
          ) : dirty ? (
            <p className={styles.status} data-testid="theme-status">
              Previewing {candidateName}. Apply to keep it, or Cancel.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ThemeOptionProps {
  name: string;
  value: string;
  label: string;
  detail: string;
  checked: boolean;
  saved: boolean;
  /** One theme's swatch, or `swatches` for System's light and dark pair. */
  theme?: ThemeDefinition;
  swatches?: (ThemeDefinition | undefined)[];
  onChoose: (value: string) => void;
}

/** Memoized: with stable props, only options whose checked or saved state changed re-render. */
const ThemeOption = memo(function ThemeOption({
  name,
  value,
  label,
  detail,
  checked,
  saved,
  theme,
  swatches,
  onChoose,
}: ThemeOptionProps) {
  const shownSwatches = swatches ?? [theme];
  return (
    <label className={styles.option} data-checked={checked || undefined} data-testid={`theme-option-${value}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChoose(value)}
        className="visually-hidden"
      />
      <span className={styles.swatches} aria-hidden="true">
        {shownSwatches.map((swatch, index) =>
          swatch ? (
            <span key={index} className={styles.swatch} style={{ background: swatch.tokens.bg, color: swatch.tokens.text }}>
              Aa
              <span style={{ background: swatch.tokens.accent }} />
            </span>
          ) : null,
        )}
      </span>
      <span className={styles.optionText}>
        <span className={styles.optionName}>{label}</span>
        <span className={styles.optionDetail}>
          {detail}
          {saved ? " · saved" : ""}
        </span>
      </span>
    </label>
  );
});

/** A small, realistic look at a theme, drawn with its own tokens whatever the page shows. */
function ThemePreview({ theme, label }: { theme: ThemeDefinition; label: string }) {
  const vars = Object.fromEntries(Object.entries(theme.tokens).map(([token, value]) => [`--${token}`, value]));
  return (
    <figure className={styles.preview} style={vars as React.CSSProperties} data-testid="theme-preview">
      <figcaption className="visually-hidden">Preview of {label}</figcaption>
      <div className={styles.previewBar} aria-hidden="true">
        <span className={styles.previewLogo}>codebases</span>
        <span>Puzzles</span>
      </div>
      <div className={styles.previewBody} aria-hidden="true">
        <p className={styles.previewTitle}>Where a path is matched</p>
        <p className={styles.previewText}>
          <span className={styles.previewEasy}>Easy</span> · <span className={styles.previewMuted}>honojs/hono</span>
        </p>
        <pre className={styles.previewCode}>
          <span style={{ color: theme.tokens["syntax-keyword"] }}>function</span>{" "}
          <span style={{ color: theme.tokens["syntax-function"] }}>match</span>(path:{" "}
          <span style={{ color: theme.tokens["syntax-type"] }}>string</span>) {"{"}
          {"\n  "}
          <span style={{ color: theme.tokens["syntax-keyword"] }}>return</span>{" "}
          <span style={{ color: theme.tokens["syntax-string"] }}>&quot;/users&quot;</span>
          {"\n}"}
        </pre>
        <div className={styles.previewRow}>
          <span className={styles.previewButton}>Submit answer</span>
          <span className={styles.previewOk}><Icon name="check" /> Correct</span>
          <span className={styles.previewBad}><Icon name="x" /> Incorrect</span>
        </div>
        <div className={styles.previewHeat}>
          {(["heat-0", "heat-1", "heat-2", "heat-3", "heat-4"] as const).map((step) => (
            <span key={step} style={{ background: theme.tokens[step] }} />
          ))}
        </div>
      </div>
      <p className={styles.previewName}>{label}</p>
    </figure>
  );
}
