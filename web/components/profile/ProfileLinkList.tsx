import styles from "@/components/profile/profile.module.css";
import { LinkMark } from "@/components/settings/LinkMark";
import type { ProfileLinks } from "@/lib/api-types";
import { displayUrl, LINK_LABELS, LINK_PLATFORMS } from "@/lib/profile-fields";

/**
 * The links a user added, as plain text labels and links. They're unverified links the user typed,
 * so nothing calls them connected accounts; each opens in a new tab with no referrer or opener.
 */
export function ProfileLinkList({ links }: { links: ProfileLinks }) {
  const items = [
    ...LINK_PLATFORMS.flatMap((platform) => {
      const url = links[platform];
      return url ? [{ key: platform, mark: platform, label: LINK_LABELS[platform], url }] : [];
    }),
    ...links.custom.map((entry, index) => ({ key: `custom-${index}`, mark: "custom" as const, label: entry.label, url: entry.url })),
  ];
  if (items.length === 0) return null;
  return (
    <ul className={styles.links} aria-label="Links" data-testid="profile-links">
      {items.map((item) => (
        <li key={item.key}>
          <LinkMark platform={item.mark} />
          <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">
            {item.label}
            <span className={styles.linkUrl}>{displayUrl(item.url)}</span>
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
