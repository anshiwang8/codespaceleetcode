"use client";

import { useLayoutEffect } from "react";
import { syncReturningAttribute } from "@/lib/returning";

/**
 * The head script marks a returning browser on a full page load. Arriving at the landing page by
 * a link, such as the logo, doesn't rerun it, so this syncs the mark before paint instead.
 */
export function ReturningMark() {
  useLayoutEffect(() => {
    syncReturningAttribute();
  }, []);
  return null;
}
