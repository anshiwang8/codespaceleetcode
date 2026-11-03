"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import styles from "@/components/list/list.module.css";
import { browseHref, type BrowseFilters, type BrowseState } from "@/lib/browse";
import { TYPE_LABELS } from "@/lib/client/labels";

interface FilterBarProps {
  state: BrowseState;
  repos: string[];
}

/** The filters that don't have their own control above: type and repo, plus clearing all of them. */
export function FilterBar({ state, repos }: FilterBarProps) {
  const { filters } = state;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setFilter = (name: keyof BrowseFilters, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  };

  const select = (
    name: "type" | "repo",
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <label className={styles.filter}>
      <span>{label}</span>
      <select value={filters[name] ?? ""} onChange={(event) => setFilter(name, event.target.value)}>
        <option value="">All</option>
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
  const active = Object.values(filters).some(Boolean);

  return (
    <div className={styles.filters} aria-busy={pending}>
      {select("type", "Type", entries(TYPE_LABELS))}
      {select("repo", "Repo", plain(repos))}
      {active ? (
        <Link href={browseHref({ filters: {}, group: state.group })} className={styles.clear}>
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
