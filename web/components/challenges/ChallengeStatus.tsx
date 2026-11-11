import { Icon, type IconName } from "@/components/site/Icon";
import type { ChallengeState } from "@/components/challenges/copy";

const BADGES: Record<ChallengeState, { icon: IconName; tone: string; current: string; past: string }> = {
  completed: { icon: "status-solved", tone: "badge-ok", current: "Completed", past: "Completed on time" },
  "solved-elsewhere": { icon: "check", tone: "", current: "Solved before", past: "Solved, not on time" },
  attempted: { icon: "status-attempted", tone: "badge-info", current: "Attempted", past: "Attempted" },
  "not-started": { icon: "status-unsolved", tone: "", current: "Not started", past: "Not attempted" },
};

/** A challenge's state as an icon and words, never color alone. `past` words it for the archive. */
export function ChallengeStatus({ state, past = false }: { state: ChallengeState; past?: boolean }) {
  const badge = BADGES[state];
  return (
    <span className={["badge", badge.tone].filter(Boolean).join(" ")} data-testid="challenge-state" data-state={state}>
      <Icon name={badge.icon} />
      {past ? badge.past : badge.current}
    </span>
  );
}
