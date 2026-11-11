"use client";

import { useEffect, useState } from "react";
import styles from "@/components/challenges/challenges.module.css";
import { formatTimeLeft } from "@/lib/periods";

interface TimeLeftProps {
  /** ISO timestamp the period ends at. */
  endsAt: string;
  /** The server's clock when the page was built (ChallengesResponse.now). */
  serverNow: string;
  /** Words before the time while it runs, such as "Ends in ". Left out once it has ended. */
  prefix?: string;
}

/**
 * Time left in a challenge period. It starts from the server's clock and adds only the time that
 * has passed in this tab since, measured with the monotonic performance clock, so a wrong clock in
 * the browser can't change it. It ticks on each minute boundary and stops at the end.
 */
export function TimeLeft({ endsAt, serverNow, prefix = "" }: TimeLeftProps) {
  const [tick, setTick] = useState<{ base: string; at: number } | null>(null);
  // A new server time (after a refresh) replaces whatever this tab counted from the old one.
  const now = tick && tick.base === serverNow ? tick.at : Date.parse(serverNow);
  const remaining = Date.parse(endsAt) - now;

  useEffect(() => {
    const base = Date.parse(serverNow);
    const start = performance.now();
    const end = Date.parse(endsAt);
    let timer: number | undefined;
    const schedule = () => {
      const current = base + (performance.now() - start);
      const left = end - current;
      if (left <= 0) return;
      // Wake just after the next whole minute of remaining time, so the shown minutes stay exact.
      const delay = (left % 60_000 || 60_000) + 50;
      timer = window.setTimeout(() => {
        setTick({ base: serverNow, at: base + (performance.now() - start) });
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [endsAt, serverNow]);

  if (remaining <= 0) {
    return (
      <span className={styles.ended} data-testid="challenge-time-left" data-ended="true">
        Ended.{" "}
        <button type="button" className={styles.inlineButton} onClick={() => window.location.reload()}>
          Show the new challenge
        </button>
      </span>
    );
  }
  return (
    <span data-testid="challenge-time-left">
      {prefix}
      <time dateTime={endsAt}>{formatTimeLeft(endsAt, new Date(now))}</time>
    </span>
  );
}
