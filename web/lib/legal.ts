// The privacy policy and terms are drafts until someone accountable reviews them (spec.md section
// 14, M7 and M11). When a change sends a page back to draft, set its `reviewed` to false and mark
// each open question on it with a <ReviewNote>. Whoever approves the page resolves and deletes every
// note, sets `reviewed` back to true and updates its date. While a page is a draft it says so.
export const LEGAL = {
  PAGES: {
    // Approved 2026-11-12 (M11), after the rewrite covering the verified email, profile details,
    // pictures, themes, Gmail over SMTP, hints, points, challenges, achievements, the opt-in
    // leaderboard and deletion from Settings → Danger zone.
    privacy: { reviewed: true, lastUpdated: "2026-11-12" },
    // Approved 2026-11-05 (M7), and again 2026-11-12 (M11) with leaderboard names, points and
    // deletion from Settings.
    terms: { reviewed: true, lastUpdated: "2026-11-12" },
  },
  /** Where people write about their data or the terms. */
  CONTACT: "mailcodebases@gmail.com" as string | null,
} as const;

export type LegalPageKey = keyof typeof LEGAL.PAGES;
