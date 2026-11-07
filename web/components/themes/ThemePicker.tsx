"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import styles from "@/components/themes/themes.module.css";
import {
  cancelPreview,
  commit,
  getState,
  loadCatalog,
  preview,
  subscribe,
  toggleFavorite,
  type AppearanceState,
} from "@/lib/themes/controller";
import { DEFAULT_PREFERENCE, SYSTEM_THEMES, type ThemePreference } from "@/lib/themes/runtime";
import { DEFAULT_LIGHT_ID, type ThemeDefinition } from "@/lib/themes/tokens";
import { Icon } from "@/components/site/Icon";

type Filter = "all" | "light" | "dark" | "favorites";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "favorites", label: "Favorites" },
];

const SERVER_STATE: AppearanceState = { committed: DEFAULT_PREFERENCE, favorites: [], previewing: null, scope: "guest" };
const keyOf = (preference: ThemePreference) => (preference.mode === "system" ? "system" : preference.id);

interface ThemePickerProps {
  /** "dialog" is the compact header version, which closes after Apply or Cancel. */
  variant: "page" | "dialog";
  onClose?: () => void;
}

/**
 * Picks a theme. Choosing one previews it on the whole page without saving; Apply saves it (to the
 * account when signed in, to this browser otherwise), and Cancel goes back to the saved theme.
 * Leaving without applying cancels the preview too.
 */
export function ThemePicker({ variant, onClose }: ThemePickerProps) {
  const appearance = useSyncExternalStore(subscribe, getState, () => SERVER_STATE);
  const [themes, setThemes] = useState<readonly ThemeDefinition[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [candidate, setCandidate] = useState<ThemePreference>(appearance.committed);
  const [status, setStatus] = useState<{ kind: "saved" | "error" | "pending"; text: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
  const favorites = useMemo(() => new Set(appearance.favorites), [appearance.favorites]);
  const shown = useMemo(() => {
    if (!themes) return [];
    const needle = query.trim().toLowerCase();
    const defaults = themes.filter((theme) => theme.source === null);
    const rest = themes.filter((theme) => theme.source !== null).sort((a, b) => a.name.localeCompare(b.name, "en-US"));
    return [...defaults, ...rest].filter(
      (theme) =>
        (filter === "all" || (filter === "favorites" ? favorites.has(theme.id) : theme.scheme === filter)) &&
        (needle === "" || theme.name.toLowerCase().includes(needle)),
    );
  }, [themes, query, filter, favorites]);
  const showSystem = filter === "all" && (query.trim() === "" || "system".includes(query.trim().toLowerCase()));

  const choose = (next: ThemePreference) => {
    setCandidate(next);
    setStatus(null);
    void preview(next);
  };

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
      <div className={styles.controls}>
        <label className={styles.search}>
          <span className="field-label">Search themes</span>
          <input
            type="search"
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Theme name"
            data-testid="theme-search"
          />
        </label>
        <div className={styles.filters} role="radiogroup" aria-label="Show">
          {FILTERS.map((option) => (
            <label key={option.value} className={styles.filter} data-selected={filter === option.value || undefined}>
              <input
                type="radio"
                name={`theme-filter-${variant}`}
                value={option.value}
                checked={filter === option.value}
                onChange={() => setFilter(option.value)}
                className="visually-hidden"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>


      <div className={styles.body}>
        <div className={styles.list} ref={listRef} role="radiogroup" aria-label="Themes" data-testid="theme-list">
          {loadError ? (
            <p className="notice notice-error">The theme list couldn&apos;t be loaded. Reload the page to try again.</p>
          ) : !themes ? (
            <p className="muted" role="status">
              Loading themes…
            </p>
          ) : (
            <>
              {showSystem ? (
                <ThemeOption
                  name={`theme-${variant}`}
                  value="system"
                  label="System"
                  detail="Light or dark, following this device"
                  checked={candidateKey === "system"}
                  saved={committedKey === "system"}
                  favorite={false}
                  swatches={[byId.get(SYSTEM_THEMES.light), byId.get(SYSTEM_THEMES.dark)]}
                  onChoose={() => choose({ mode: "system" })}
                />
              ) : null}
              {shown.map((theme) => (
                <ThemeOption
                  key={theme.id}
                  name={`theme-${variant}`}
                  value={theme.id}
                  label={theme.name}
                  detail={theme.id === DEFAULT_LIGHT_ID ? "Default · light" : theme.scheme === "dark" ? "Dark" : "Light"}
                  checked={candidateKey === theme.id}
                  saved={committedKey === theme.id}
                  favorite={favorites.has(theme.id)}
                  swatches={[theme]}
                  onChoose={() => choose({ mode: "theme", id: theme.id })}
                />
              ))}
              {shown.length === 0 && !showSystem ? (
                <p className={styles.none}>
                  {filter === "favorites"
                    ? "No favorites yet. Choose a theme, then Add to favorites."
                    : "No theme has that name."}
                </p>
              ) : null}
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
          {candidate.mode === "theme" ? (
            <button
              type="button"
              className="btn btn-small btn-quiet"
              aria-pressed={favorites.has(candidate.id)}
              onClick={() =>
                void toggleFavorite(candidate.id).catch((error: unknown) =>
                  setStatus({ kind: "error", text: error instanceof Error ? error.message : "Couldn't save favorites." }),
                )
              }
              data-testid="theme-favorite"
            >
              <Icon name={favorites.has(candidate.id) ? "star-filled" : "star"} />
              {favorites.has(candidate.id) ? "Remove from favorites" : "Add to favorites"}
            </button>
          ) : null}
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
  favorite: boolean;
  swatches: (ThemeDefinition | undefined)[];
  onChoose: () => void;
}

function ThemeOption({ name, value, label, detail, checked, saved, favorite, swatches, onChoose }: ThemeOptionProps) {
  return (
    <label className={styles.option} data-checked={checked || undefined} data-testid={`theme-option-${value}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChoose} className="visually-hidden" />
      <span className={styles.swatches} aria-hidden="true">
        {swatches.map((theme, index) =>
          theme ? (
            <span key={index} className={styles.swatch} style={{ background: theme.tokens.bg }}>
              <span style={{ background: theme.tokens.accent }} />
              <span style={{ background: theme.tokens.text }} />
            </span>
          ) : null,
        )}
      </span>
      <span className={styles.optionText}>
        <span className={styles.optionName}>
          {label}
          {favorite ? (
            <span className={styles.star} role="img" aria-label="favorite">
              <Icon name="star-filled" />
            </span>
          ) : null}
        </span>
        <span className={styles.optionDetail}>
          {detail}
          {saved ? " · saved" : ""}
        </span>
      </span>
    </label>
  );
}

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
