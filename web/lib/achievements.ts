// Achievement definitions (spec section 10, "Achievements"). Each one is a metric and a threshold,
// so a new badge is a new entry here, using one of the metrics web/lib/server/achievements.ts
// already measures. Earned achievements are stored by id (migration 0009), so never reuse or
// rename an id: retire an entry by keeping it with `retired: true` instead.

import type { Difficulty } from "@/lib/api-types";
import type { IconName } from "@/components/site/Icon";

export type AchievementMetric =
  /** Distinct puzzles solved, optionally of one difficulty. */
  | { kind: "solves"; difficulty?: Difficulty }
  /** Distinct repositories with a solved puzzle. */
  | { kind: "repos" }
  /** Distinct puzzle types with a solved puzzle. A threshold of "all" means every published type. */
  | { kind: "types" }
  /** Puzzles whose first graded submission was correct. */
  | { kind: "first-try" }
  /** Puzzles solved with no hint revealed first, counting only solves made since hints were tracked. */
  | { kind: "hint-free" }
  /** The longest run of consecutive UTC dates with a graded submission, as on the profile. */
  | { kind: "activity-streak" }
  /** Challenge periods of one kind completed while open. */
  | { kind: "challenges"; period: "daily" | "weekly" | "monthly" }
  /** The longest run of consecutive UTC dates with the daily challenge completed. */
  | { kind: "challenge-streak" };

export const ACHIEVEMENT_CATEGORIES = [
  { id: "getting-started", label: "Getting started" },
  { id: "difficulty", label: "Difficulty" },
  { id: "consistency", label: "Consistency" },
  { id: "mastery", label: "Mastery" },
  { id: "challenges", label: "Challenges" },
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number]["id"];

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  metric: AchievementMetric;
  threshold: number | "all";
  icon: IconName;
  /** Kept so earned rows still have a definition, but never awarded or listed as locked. */
  retired?: boolean;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: "first-steps",
    title: "First Steps",
    description: "Solve your first puzzle.",
    category: "getting-started",
    metric: { kind: "solves" },
    threshold: 1,
    icon: "status-solved",
  },
  {
    id: "getting-comfortable",
    title: "Getting Comfortable",
    description: "Solve 5 puzzles.",
    category: "getting-started",
    metric: { kind: "solves" },
    threshold: 5,
    icon: "status-solved",
  },
  {
    id: "code-explorer",
    title: "Code Explorer",
    description: "Solve 10 puzzles.",
    category: "getting-started",
    metric: { kind: "solves" },
    threshold: 10,
    icon: "compass",
  },
  {
    id: "easy-explorer",
    title: "Easy Explorer",
    description: "Solve 10 Easy puzzles.",
    category: "difficulty",
    metric: { kind: "solves", difficulty: "easy" },
    threshold: 10,
    icon: "award",
  },
  {
    id: "medium-challenger",
    title: "Medium Challenger",
    description: "Solve 10 Medium puzzles.",
    category: "difficulty",
    metric: { kind: "solves", difficulty: "medium" },
    threshold: 10,
    icon: "award",
  },
  {
    id: "hard-mode",
    title: "Hard Mode",
    description: "Solve 5 Hard puzzles.",
    category: "difficulty",
    metric: { kind: "solves", difficulty: "hard" },
    threshold: 5,
    icon: "trophy",
  },
  {
    id: "three-day-streak",
    title: "Three-Day Streak",
    description: "Submit an answer on 3 UTC days in a row.",
    category: "consistency",
    metric: { kind: "activity-streak" },
    threshold: 3,
    icon: "flame",
  },
  {
    id: "seven-day-streak",
    title: "Seven-Day Streak",
    description: "Submit an answer on 7 UTC days in a row.",
    category: "consistency",
    metric: { kind: "activity-streak" },
    threshold: 7,
    icon: "flame",
  },
  {
    id: "thirty-day-streak",
    title: "Thirty-Day Streak",
    description: "Submit an answer on 30 UTC days in a row.",
    category: "consistency",
    metric: { kind: "activity-streak" },
    threshold: 30,
    icon: "flame",
  },
  {
    id: "first-try-success",
    title: "First-Try Success",
    description: "Solve a puzzle with your first submission to it.",
    category: "mastery",
    metric: { kind: "first-try" },
    threshold: 1,
    icon: "check",
  },
  {
    id: "independent-thinker",
    title: "Independent Thinker",
    description: "Solve a puzzle without revealing any of its hints.",
    category: "mastery",
    metric: { kind: "hint-free" },
    threshold: 1,
    icon: "lightbulb",
  },
  {
    id: "repository-explorer",
    title: "Repository Explorer",
    description: "Solve puzzles in 5 different repositories.",
    category: "mastery",
    metric: { kind: "repos" },
    threshold: 5,
    icon: "compass",
  },
  {
    id: "all-rounder",
    title: "All-Rounder",
    description: "Solve at least one puzzle of every type.",
    category: "mastery",
    metric: { kind: "types" },
    threshold: "all",
    icon: "star",
  },
  {
    id: "daily-debut",
    title: "Daily Debut",
    description: "Complete a daily challenge on its day.",
    category: "challenges",
    metric: { kind: "challenges", period: "daily" },
    threshold: 1,
    icon: "calendar",
  },
  {
    id: "daily-week",
    title: "Week of Dailies",
    description: "Complete the daily challenge 7 days in a row.",
    category: "challenges",
    metric: { kind: "challenge-streak" },
    threshold: 7,
    icon: "flame",
  },
  {
    id: "weekly-regular",
    title: "Weekly Regular",
    description: "Complete 4 weekly challenges during their weeks.",
    category: "challenges",
    metric: { kind: "challenges", period: "weekly" },
    threshold: 4,
    icon: "calendar",
  },
  {
    id: "monthly-milestone",
    title: "Monthly Milestone",
    description: "Complete a monthly challenge during its month.",
    category: "challenges",
    metric: { kind: "challenges", period: "monthly" },
    threshold: 1,
    icon: "trophy",
  },
  {
    id: "monthly-trio",
    title: "Quarter Climber",
    description: "Complete 3 monthly challenges during their months.",
    category: "challenges",
    metric: { kind: "challenges", period: "monthly" },
    threshold: 3,
    icon: "trophy",
  },
];

export function achievementById(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}
