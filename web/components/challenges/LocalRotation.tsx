"use client";

import { useSyncExternalStore } from "react";
import type { PeriodKind } from "@/lib/api-types";
import { LOCALE } from "@/lib/format";

// The one place the site shows a time in the reader's own zone: the next rotation, as a courtesy
// next to the UTC time that rules it. The server can't know the zone, so its HTML has the UTC text
// only, and the local equivalent appears once the page runs in the browser.

const noSubscription = () => () => {};

function localEquivalent(kind: PeriodKind, endsAt: string): string | null {
  const moment = new Date(endsAt);
  if (Number.isNaN(moment.getTime()) || moment.getTimezoneOffset() === 0) return null;
  const time = new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" }).format(moment);
  switch (kind) {
    case "daily":
      return `${time} your time`;
    case "weekly":
      return `${new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(moment)} at ${time} your time`;
    case "monthly":
      return `${new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric" }).format(moment)} at ${time} your time`;
  }
}

/** "(7:00 PM your time)" after hydration, or nothing on the server and in UTC. */
export function LocalRotation({ kind, endsAt }: { kind: PeriodKind; endsAt: string }) {
  const local = useSyncExternalStore(
    noSubscription,
    () => localEquivalent(kind, endsAt),
    () => null,
  );
  if (!local) return null;
  return <span data-testid="challenge-local-time"> ({local})</span>;
}
