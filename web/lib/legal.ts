// The privacy policy and terms are drafts until someone accountable reviews them (spec.md section
// 14, M7). Whoever approves them sets REVIEWED to true, fills in CONTACT, and updates LAST_UPDATED.
// Until then each page says it's a draft.
export const LEGAL = {
  REVIEWED: false,
  LAST_UPDATED: "2026-11-05",
  /** Where people write about their data, for example privacy@<domain>. Null until M7 sets it. */
  CONTACT: null as string | null,
} as const;
