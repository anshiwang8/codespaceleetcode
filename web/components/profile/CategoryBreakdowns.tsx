import { ProgressBreakdown } from "@/components/profile/ProgressBreakdown";
import styles from "@/components/profile/profile.module.css";
import { PUZZLE_TYPES, type Difficulty, type ProfileProgress } from "@/lib/api-types";
import { browseHref, DEFAULT_GROUPING } from "@/lib/browse";
import { DIFFICULTY_LABELS, TYPE_LABELS } from "@/lib/client/labels";
import { topicLabel } from "@/lib/topics";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** Progress by type, difficulty, repository and topic. Each category links to the filtered list. */
export function CategoryBreakdowns({ progress }: { progress: ProfileProgress }) {
  return (
    <div className={styles.breakdowns}>
      <ProgressBreakdown
        id="type"
        title="By type"
        rows={PUZZLE_TYPES.map((type) => ({
          key: type,
          label: TYPE_LABELS[type],
          href: browseHref({ filters: { type }, group: DEFAULT_GROUPING }),
          ...progress.byType[type],
        }))}
      />
      <ProgressBreakdown
        id="difficulty"
        title="By difficulty"
        rows={DIFFICULTIES.map((difficulty) => ({
          key: difficulty,
          label: DIFFICULTY_LABELS[difficulty],
          tone: `difficulty-${difficulty}`,
          href: browseHref({ filters: { difficulty }, group: DEFAULT_GROUPING }),
          ...progress.byDifficulty[difficulty],
        }))}
      />
      <ProgressBreakdown
        id="repo"
        title="By repository"
        mono
        rows={progress.byRepo.map((repo) => ({
          key: repo.repo,
          label: repo.repo,
          detail: repo.language,
          href: browseHref({ filters: { repo: repo.repo }, group: DEFAULT_GROUPING }),
          solved: repo.solved,
          attempted: repo.attempted,
          total: repo.total,
        }))}
      />
      <ProgressBreakdown
        id="topic"
        title="By topic"
        note="A puzzle can have up to three topics and counts under each of them, so these numbers overlap and don't add up to your total."
        rows={progress.byTopic.map((topic) => ({
          key: topic.topic,
          label: topicLabel(topic.topic),
          href: browseHref({ filters: { tag: topic.topic }, group: DEFAULT_GROUPING }),
          solved: topic.solved,
          attempted: topic.attempted,
          total: topic.total,
        }))}
      />
    </div>
  );
}
