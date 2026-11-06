"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import styles from "@/components/list/list.module.css";
import { browseHref, orderTags, type BrowseFilters, type BrowseState } from "@/lib/browse";
import { TYPE_LABELS } from "@/lib/client/labels";
import { topicLabel } from "@/lib/topics";

interface FilterBarProps {
  state: BrowseState;
  repos: string[];
  /** Every tag on a published puzzle. */
  tags: string[];
}

/** Type, topic and repository, plus clearing every filter. Difficulty has the strip above. */
export function FilterBar({ state, repos, tags }: FilterBarProps) {
  const { filters } = state;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Each change is a new history entry, so Back undoes it.
  const setFilter = (name: keyof BrowseFilters, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  };

  const select = (
    name: "type" | "tag" | "repo",
    label: string,
    allLabel: string,
    options: { value: string; label: string }[],
  ) => (
    <label className={styles.filter}>
      <span className="field-label">{label}</span>
      <select className="select" value={filters[name] ?? ""} onChange={(event) => setFilter(name, event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const entries = <K extends string>(labels: Record<K, string>) =>
    (Object.entries(labels) as [K, string][]).map(([value, label]) => ({ value, label }));
  const plain = (values: string[]) => values.map((value) => ({ value, label: value }));
  // A topic from an old link still shows as selected, even if no puzzle has it now.
  const topics = orderTags(filters.tag ? [...tags, filters.tag] : tags).map((tag) => ({
    value: tag,
    label: topicLabel(tag),
  }));
  const active = Object.values(filters).some(Boolean);

  return (
    <div className={`${styles.filters} pending-track`} aria-busy={pending}>
      {select("type", "Type", "All types", entries(TYPE_LABELS))}
      {select("tag", "Topic", "All topics", topics)}
      {select("repo", "Repository", "All repositories", plain(repos))}
      {active ? (
        <Link href={browseHref({ ...state, filters: {} })} className={`btn btn-quiet ${styles.clear}`}>
          Clear filters
        </Link>
      ) : null}
      <span className={styles.updating} role="status">
          {pending ? "Updating…" : ""}
        </span>
    </div>
  );
}
