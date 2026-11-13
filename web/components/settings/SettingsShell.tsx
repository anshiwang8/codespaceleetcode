import Link from "next/link";
import styles from "@/components/settings/settings.module.css";

// The parts of /settings that need no data: the section list, each section's card and heading,
// and the placeholders shown while a section's data streams in. The loading screen and the page
// share them, so the layout doesn't move when the real content arrives.

export const SETTINGS_SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "profile", label: "Profile" },
  { id: "links", label: "Links" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "email", label: "Email and account" },
] as const;

type SectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export function SettingsToc() {
  return (
    <nav className={styles.toc} aria-label="Settings sections">
      <ul>
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const TITLES: Record<SectionId, string> = {
  appearance: "Appearance",
  profile: "Profile",
  links: "Links",
  leaderboard: "Leaderboard visibility",
  email: "Email and account",
};

const LEDES: Partial<Record<SectionId, React.ReactNode>> = {
  appearance: (
    <>
      189 themes, light and dark. Choosing one previews it here; Apply saves it to your account, so it follows you to
      any browser you sign in on.
    </>
  ),
  profile: "Everything here is optional, and only you can see it.",
  leaderboard: (
    <>
      Off by default. Nobody appears on the <Link href="/leaderboard">leaderboard</Link> unless they join here.
    </>
  ),
};

/** A settings card: its heading and lede are fixed, so they show before the section's data. */
export function SettingsSection({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const lede = LEDES[id];
  return (
    <section id={id} className={`card ${styles.section}`} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="section-title">
        {TITLES[id]}
      </h2>
      {lede ? <p className={styles.lede}>{lede}</p> : null}
      {children}
    </section>
  );
}

export type SkeletonSize = "appearance" | "profile" | "links" | "leaderboard" | "email";

const LOADING_TEXT: Record<SkeletonSize, string> = {
  appearance: "Loading themes…",
  profile: "Loading your profile…",
  links: "Loading your links…",
  leaderboard: "Loading your leaderboard setting…",
  email: "Loading your email settings…",
};

/**
 * Holds a section's place, at about its real height, while its data loads. The loading screen
 * passes `announce={false}` and says "Loading your settings" once instead of once per section.
 */
export function SectionSkeleton({ size, announce = true }: { size: SkeletonSize; announce?: boolean }) {
  return (
    <div className={styles.sectionSkeleton} data-testid={`settings-loading-${size}`}>
      {announce ? (
        <p className="visually-hidden" role="status">
          {LOADING_TEXT[size]}
        </p>
      ) : null}
      <div aria-hidden="true" className={`skeleton ${styles[`skeleton-${size}`]}`} />
    </div>
  );
}
