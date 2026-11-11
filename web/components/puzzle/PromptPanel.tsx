"use client";

import Link from "next/link";
import { type KeyboardEvent, type RefObject, useId, useRef, useState } from "react";
import { HintPanel } from "@/components/puzzle/HintPanel";
import { Markdown } from "@/components/puzzle/Markdown";
import { SolutionView } from "@/components/puzzle/SolutionView";
import hintStyles from "@/components/puzzle/hints.module.css";
import styles from "@/components/puzzle/puzzle.module.css";
import type { PuzzleDetail, PuzzleStatus } from "@/lib/api-types";
import {
  answerKindInWords,
  DIFFICULTY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/client/labels";
import { PERIOD_KINDS, type PeriodKind } from "@/lib/periods";
import { topicLabel } from "@/lib/topics";
import { Icon } from "@/components/site/Icon";

export type PromptTab = "description" | "solution";

const TABS: readonly PromptTab[] = ["description", "solution"];
const TAB_LABELS: Record<PromptTab, string> = { description: "Description", solution: "Solution" };

/** How a puzzle featured in an open challenge period says so. */
const FEATURED_LABELS: Record<PeriodKind, string> = {
  daily: "Today's daily challenge",
  weekly: "This week's challenge",
  monthly: "This month's challenge",
};

interface PromptPanelProps {
  puzzle: PuzzleDetail;
  status: PuzzleStatus;
  unlocked: boolean;
  /** Known to be signed out, as opposed to still finding out. */
  signedOut: boolean;
  tab: PromptTab;
  onTabChange: (tab: PromptTab) => void;
  /** Lets the answer tray's "View solution" move focus onto the Solution tab. */
  solutionTabRef: RefObject<HTMLButtonElement | null>;
}

export function PromptPanel({
  puzzle,
  status,
  unlocked,
  signedOut,
  tab,
  onTabChange,
  solutionTabRef,
}: PromptPanelProps) {
  const baseId = useId();
  const descriptionTabRef = useRef<HTMLButtonElement>(null);
  const tabRefs: Record<PromptTab, RefObject<HTMLButtonElement | null>> = {
    description: descriptionTabRef,
    solution: solutionTabRef,
  };
  const tabId = (name: PromptTab) => `${baseId}-tab-${name}`;
  const panelId = (name: PromptTab) => `${baseId}-panel-${name}`;

  // The solution is fetched the first time its tab is open while unlocked, and then stays mounted
  // (hidden on the other tab) so it isn't fetched again. Never while locked: the server would refuse,
  // and there is nothing to show. Losing the unlock, by signing out, drops it.
  const [solutionOpened, setSolutionOpened] = useState(false);
  if (unlocked && tab === "solution" && !solutionOpened) setSolutionOpened(true);
  if (!unlocked && solutionOpened) setSolutionOpened(false);
  const solutionIsNew = unlocked && !solutionOpened;

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    let next: PromptTab | undefined;
    if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
    else if (event.key === "ArrowLeft") next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (event.key === "Home") next = TABS[0];
    else if (event.key === "End") next = TABS[TABS.length - 1];
    if (!next) return;
    event.preventDefault();
    onTabChange(next);
    tabRefs[next].current?.focus();
  };

  return (
    <section className={styles.promptPanel} aria-label="Puzzle">
      <div
        className={styles.promptTabs}
        role="tablist"
        aria-label="Puzzle panel"
        onKeyDown={onTabKeyDown}
        data-testid="prompt-tabs"
      >
        {TABS.map((name) => (
          <button
            key={name}
            ref={tabRefs[name]}
            type="button"
            role="tab"
            id={tabId(name)}
            aria-selected={tab === name}
            aria-controls={panelId(name)}
            tabIndex={tab === name ? 0 : -1}
            className={styles.promptTab}
            data-testid={`prompt-tab-${name}`}
            onClick={() => onTabChange(name)}
          >
            {name === "solution" && !unlocked ? <Icon name="lock" className={styles.lockIcon} /> : null}
            {TAB_LABELS[name]}
            {name === "solution" && !unlocked ? <span className="visually-hidden"> (locked)</span> : null}
            {name === "solution" && solutionIsNew ? (
              <span className={styles.tabBadge} data-testid="solution-tab-badge">
                Unlocked
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={panelId("description")}
        aria-labelledby={tabId("description")}
        hidden={tab !== "description"}
        className={styles.tabPanel}
        data-testid="prompt-panel-description"
      >
        <DescriptionTab puzzle={puzzle} status={status} />
      </div>

      <div
        role="tabpanel"
        id={panelId("solution")}
        aria-labelledby={tabId("solution")}
        hidden={tab !== "solution"}
        className={styles.tabPanel}
        // Focusable so keyboard users can scroll a long explanation straight from the tab.
        tabIndex={0}
        data-testid="prompt-panel-solution"
      >
        {unlocked ? (
          solutionOpened ? <SolutionView slug={puzzle.slug} /> : null
        ) : (
          <SolutionLocked signedOut={signedOut} />
        )}
      </div>
    </section>
  );
}

function DescriptionTab({ puzzle, status }: { puzzle: PuzzleDetail; status: PuzzleStatus }) {
  const noPersonChecked = puzzle.verifiedBy.every((name) => name.startsWith("agent:"));

  return (
    <>
      <h1 className={styles.puzzleTitle}>{puzzle.title}</h1>
      <div className={styles.metaRow}>
        <span className="chip">{TYPE_LABELS[puzzle.type]}</span>
        <span className={`chip difficulty-${puzzle.difficulty}`}>
          {DIFFICULTY_LABELS[puzzle.difficulty]}
        </span>
        {/* Only a status worth saying: an untouched puzzle doesn't need a "Not started" chip. */}
        {status === "unsolved" ? null : (
          <span className={`chip status-${status} ${styles.statusChip}`} data-testid="puzzle-status">
            <Icon name={status === "solved" ? "status-solved" : "status-attempted"} />
            {STATUS_LABELS[status]}
          </span>
        )}
        {puzzle.tags.map((tag) => (
          <span key={tag} className="chip">
            {topicLabel(tag)}
          </span>
        ))}
      </div>

      {puzzle.featuredIn.length > 0 ? (
        <ul className={hintStyles.featured} aria-label="Challenges" data-testid="featured-in">
          {PERIOD_KINDS.filter((kind) => puzzle.featuredIn.includes(kind)).map((kind) => (
            <li key={kind}>
              <Link href="/challenges" className={`chip ${hintStyles.featuredChip}`} data-testid={`featured-${kind}`}>
                <Icon name="calendar" />
                {FEATURED_LABELS[kind]}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <Markdown source={puzzle.prompt} testId="prompt" />

      <div className={styles.block}>
        <h2>Your answer</h2>
        <p data-testid="answer-kind">{answerKindInWords(puzzle.answerKind, puzzle.setCount)}</p>
      </div>

      <HintPanel puzzle={puzzle} status={status} />

      {noPersonChecked ? (
        <p className={styles.unverified} data-testid="agent-only-note">
          No person has checked this puzzle yet. Its second solve was done by an automated agent.
        </p>
      ) : null}
    </>
  );
}

function SolutionLocked({ signedOut }: { signedOut: boolean }) {
  return (
    <div className={styles.solutionLocked} data-testid="solution-locked">
      <Icon name="lock" className={styles.lockIconLarge} />
      <p>Solve this puzzle to see the solution and a full explanation.</p>
      {signedOut ? <p className="muted">Sign in to submit an answer.</p> : null}
    </div>
  );
}

