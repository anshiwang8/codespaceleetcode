import styles from "@/components/site/avatar.module.css";

// Each is dark enough for white initials to pass WCAG AA.
const TONES = ["#2563eb", "#7c3aed", "#0f766e", "#b45309", "#be185d", "#4338ca", "#15803d", "#475569"];

/** One or two letters from a login: "octo-cat" gives "OC", "octocat" gives "O". */
export function initials(login: string): string {
  const parts = login.split(/[-_.\s]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : (parts[0]?.[0] ?? "?");
  return letters.toUpperCase();
}

/** The same login always gets the same color. */
export function avatarTone(login: string): string {
  let hash = 0;
  for (const char of login) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return TONES[hash % TONES.length] ?? TONES[0] ?? "#2563eb";
}

/**
 * Initials on a colored circle. GitHub's own avatar isn't loaded: the Content Security Policy
 * allows images only from this site, so every account gets this instead, and it never fails to
 * load. Decorative, because the login is always written next to it.
 */
export function Avatar({ login, size = "small" }: { login: string; size?: "small" | "large" }) {
  return (
    <span
      className={`${styles.avatar} ${size === "large" ? styles.large : styles.small}`}
      style={{ background: avatarTone(login) }}
      aria-hidden="true"
      data-testid="avatar"
    >
      {initials(login)}
    </span>
  );
}
