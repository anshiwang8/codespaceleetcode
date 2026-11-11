"use client";

import { useEffect, useState } from "react";
import { ProgressFill } from "@/components/motion/ProgressFill";
import styles from "@/components/profile/achievements.module.css";
import profileStyles from "@/components/profile/profile.module.css";
import { Icon, type IconName } from "@/components/site/Icon";
import { ACHIEVEMENT_CATEGORIES, achievementById } from "@/lib/achievements";
import type { AchievementStatus } from "@/lib/api-types";
import { formatDate, formatNumber } from "@/lib/format";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "earned", label: "Earned" },
  { id: "locked", label: "Locked" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

/** The registry's icon for an achievement; the response carries it as a plain string. */
function iconFor(achievement: AchievementStatus): IconName {
  return achievementById(achievement.id)?.icon ?? "award";
}

function Badge({ achievement }: { achievement: AchievementStatus }) {
  const earned = achievement.unlockedAt !== null;
  const progressWords = `${formatNumber(achievement.progress)} of ${formatNumber(achievement.threshold)}`;
  const titleId = `achievement-${achievement.id}-title`;
  return (
    <li
      className={styles.badge}
      data-earned={earned ? "true" : "false"}
      data-testid={`achievement-${achievement.id}`}
      aria-labelledby={titleId}
    >
      <span className={styles.medal} aria-hidden="true">
        <Icon name={iconFor(achievement)} size={1.15} />
      </span>
      <div className={styles.body}>
        <p id={titleId} className={styles.title}>
          {achievement.title}
        </p>
        <p className={styles.description}>{achievement.description}</p>
        {earned && achievement.unlockedAt ? (
          <p className={styles.earned} data-testid="achievement-state">
            <Icon name="check" />
            <span>
              Earned <time dateTime={achievement.unlockedAt}>{formatDate(achievement.unlockedAt)}</time>
            </span>
          </p>
        ) : (
          <div className={styles.locked}>
            <p className={styles.lockedLabel} data-testid="achievement-state">
              <Icon name="lock" />
              <span>Locked</span>
              {achievement.threshold > 1 ? (
                <span className={styles.progressText} data-testid="achievement-progress">
                  {progressWords}
                </span>
              ) : null}
            </p>
            {achievement.threshold > 1 ? (
              <span
                className={`meter ${styles.meter}`}
                role="progressbar"
                aria-label={`${achievement.title} progress`}
                aria-valuemin={0}
                aria-valuemax={achievement.threshold}
                aria-valuenow={achievement.progress}
                aria-valuetext={progressWords}
              >
                <ProgressFill percent={(achievement.progress / achievement.threshold) * 100} />
              </span>
            ) : null}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Earned and locked achievements on the profile, by category, with a filter. Everything here was
 * measured on the server from recorded activity (lib/server/achievements.ts).
 */
/**
 * The profile streams in behind a loading state, so on a full page load the browser looks for
 * #achievements before it exists and stays at the top. Scroll once it's there; a client-side link
 * has already scrolled, and scrolling again lands in the same place.
 */
function useScrollToHash(id: string) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [id]);
}

export function Achievements({ achievements }: { achievements: AchievementStatus[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  useScrollToHash("achievements");
  const earnedCount = achievements.filter((achievement) => achievement.unlockedAt !== null).length;
  const shown = achievements.filter((achievement) =>
    filter === "all" ? true : filter === "earned" ? achievement.unlockedAt !== null : achievement.unlockedAt === null,
  );
  const groups = ACHIEVEMENT_CATEGORIES.map((category) => ({
    ...category,
    items: shown.filter((achievement) => achievement.category === category.id),
  })).filter((group) => group.items.length > 0);

  return (
    <section id="achievements" aria-labelledby="achievements-heading" className={`${profileStyles.section} ${styles.section}`} data-testid="achievements">
      <div className={profileStyles.sectionHeader}>
        <h2 id="achievements-heading" className="section-title">
          Achievements
        </h2>
        <p className={profileStyles.sectionNote} data-testid="achievements-summary">
          {formatNumber(earnedCount)} of {formatNumber(achievements.length)} earned
        </p>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.filter} role="group" aria-label="Show achievements">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              data-testid={`achievements-filter-${option.id}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="visually-hidden" role="status">
          {`Showing ${shown.length} ${shown.length === 1 ? "achievement" : "achievements"}.`}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="empty" data-testid="achievements-empty">
          {filter === "earned" ? (
            <>
              <strong>You haven&apos;t earned an achievement yet.</strong>
              <span>Solve your first puzzle to earn First Steps. Locked achievements show what to aim for.</span>
            </>
          ) : (
            <>
              <strong>You&apos;ve earned every achievement.</strong>
              <span>New ones may be added over time, so check back.</span>
            </>
          )}
          <button type="button" className="btn btn-small" onClick={() => setFilter("all")}>
            Show all
          </button>
        </div>
      ) : (
        <div className={`card ${styles.card}`}>
          {groups.map((group) => {
            const headingId = `achievements-${group.id}`;
            return (
              <section key={group.id} className={styles.group} aria-labelledby={headingId}>
                <h3 id={headingId} className={styles.groupTitle}>
                  {group.label}
                </h3>
                <ul className={styles.grid}>
                  {group.items.map((achievement) => (
                    <Badge key={achievement.id} achievement={achievement} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Shown in place of the section when the achievements couldn't be measured. */
export function AchievementsUnavailable() {
  return (
    <section id="achievements" aria-labelledby="achievements-heading" className={profileStyles.section} data-testid="achievements-error">
      <h2 id="achievements-heading" className="section-title">
        Achievements
      </h2>
      <p className="notice notice-error" role="alert">
        Your achievements couldn&apos;t be loaded just now. Nothing you&apos;ve earned is lost. Reload the page to try
        again.
      </p>
    </section>
  );
}
