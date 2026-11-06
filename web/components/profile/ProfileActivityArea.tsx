"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityTracker } from "@/components/profile/ActivityTracker";
import { CategoryBreakdowns } from "@/components/profile/CategoryBreakdowns";
import { ContinuePracticing } from "@/components/profile/ContinuePracticing";
import { HistoryList } from "@/components/profile/HistoryList";
import styles from "@/components/profile/profile.module.css";
import { SolveChart } from "@/components/profile/SolveChart";
import type {
  ActivityPeriodKey,
  ActivityResponse,
  HistoryPage,
  PracticeStreaks,
  ProfileProgress,
  UnfinishedPuzzle,
} from "@/lib/api-types";
import { ApiRequestError, api } from "@/lib/client/api";

interface ProfileActivityAreaProps {
  initialActivity: ActivityResponse;
  streaks: PracticeStreaks;
  history: HistoryPage;
  progress: ProfileProgress;
  unfinished: UnfinishedPuzzle[];
}

/**
 * The parts of the profile that share state: the period shown in the calendar and chart, and the
 * date picked in the calendar that filters the history. Streaks and the summary stay lifetime
 * figures whatever is picked here.
 */
export function ProfileActivityArea({
  initialActivity,
  streaks,
  history,
  progress,
  unfinished,
}: ProfileActivityAreaProps) {
  const [data, setData] = useState(initialActivity);
  const [requested, setRequested] = useState<ActivityPeriodKey>(initialActivity.activity.period);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const loadPeriod = useCallback(async (period: ActivityPeriodKey) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRequested(period);
    setLoading(true);
    setError(null);
    try {
      const next = await api.activity(period, controller.signal);
      if (controller.signal.aborted) return;
      setData(next);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof ApiRequestError && caught.status === 401
          ? "You've been signed out. Sign in again to see your activity."
          : `Couldn't load ${period === "rolling" ? "the last 365 days" : period}. Still showing ${
              data.activity.label === "Last 365 days" ? "the last 365 days" : data.activity.label
            }.`,
      );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [data.activity.label]);

  const { activity, timeline } = data;
  return (
    <>
      <ActivityTracker
        activity={activity}
        streaks={streaks}
        loading={loading}
        requested={requested}
        error={error}
        onPeriodChange={(period) => void loadPeriod(period)}
        onRetry={() => void loadPeriod(requested)}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      <ContinuePracticing
        unfinished={unfinished}
        hasSubmissions={progress.submissions > 0}
        allSolved={progress.solved === progress.total}
      />

      <section aria-labelledby="breakdown-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 id="breakdown-heading" className="section-title">
            Progress
          </h2>
          <p className={styles.sectionNote}>
            Against the puzzles available now. Select a category to browse its puzzles.
          </p>
        </div>
        <SolveChart timeline={timeline} label={activity.label} />
        <CategoryBreakdowns progress={progress} />
      </section>

      <HistoryList
        initial={history}
        repos={progress.byRepo.map((repo) => repo.repo)}
        date={selectedDate}
        onClearDate={() => setSelectedDate(null)}
      />
    </>
  );
}
