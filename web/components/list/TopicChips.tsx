import Link from "next/link";
import styles from "@/components/list/list.module.css";
import { browseHref, type BrowseState, type TopicTally } from "@/lib/browse";
import { topicDescription, topicLabel } from "@/lib/topics";

interface TopicChipsProps {
  state: BrowseState;
  tallies: TopicTally[];
}

/** Every topic with its count under the other filters. Clicking the selected topic clears it. */
export function TopicChips({ state, tallies }: TopicChipsProps) {
  const selected = state.filters.tag;
  const hrefFor = (tag: string | undefined) => browseHref({ ...state, filters: { ...state.filters, tag } });
  const description = selected ? topicDescription(selected) : null;

  return (
    <nav aria-label="Topics" className={styles.topics}>
      <ul className={styles.chips}>
        <li>
          <Link
            href={hrefFor(undefined)}
            className={styles.topicChip}
            aria-current={selected ? undefined : "true"}
            data-testid="topic-all"
          >
            All topics
          </Link>
        </li>
        {tallies.map(({ tag, total }) => {
          const isSelected = tag === selected;
          return (
            <li key={tag}>
              <Link
                href={hrefFor(isSelected ? undefined : tag)}
                className={styles.topicChip}
                aria-current={isSelected ? "true" : undefined}
                data-testid={`topic-${tag}`}
              >
                {topicLabel(tag)}{" "}
                <span className={styles.chipCount}>{total}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {description ? (
        <p className={styles.topicDescription} data-testid="topic-description">
          {description}
        </p>
      ) : null}
    </nav>
  );
}
