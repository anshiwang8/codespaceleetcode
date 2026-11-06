import styles from "@/components/settings/settings.module.css";
import type { LinkPlatform } from "@/lib/profile-fields";

const MARKS: Record<LinkPlatform | "custom", string> = {
  linkedin: "in",
  github: "gh",
  website: "www",
  x: "x",
  bluesky: "bs",
  mastodon: "md",
  custom: "↗",
};

/** A small, restrained text mark for a link's platform. Decorative: the label is always written next to it. */
export function LinkMark({ platform }: { platform: LinkPlatform | "custom" }) {
  return (
    <span className={styles.mark} aria-hidden="true">
      {MARKS[platform]}
    </span>
  );
}
