// The privacy policy and terms are drafts until someone accountable reviews them (spec.md section
// 14, M7 and M11). Whoever approves a page sets its `reviewed` to true and updates its date, and
// fills in CONTACT. Until then that page says it's a draft.
export const LEGAL = {
  PAGES: {
    // Back to draft on 2026-11-06: the policy now describes newly collected data (a verified email,
    // optional profile details, a picture, theme choices), which needs a fresh review (M11).
    privacy: { reviewed: false, lastUpdated: "2026-11-06" },
    terms: { reviewed: true, lastUpdated: "2026-11-05" },
  },
  /** Where people write about their data, for example privacy@<domain>. Null until M7 sets it. */
  CONTACT: "anshiwang15@gmail.com" as string | null,
} as const;

export type LegalPageKey = keyof typeof LEGAL.PAGES;
