// The privacy policy and terms are drafts until someone accountable reviews them (spec.md section
// 14, M7 and M11). Whoever approves a page resolves and deletes every <ReviewNote> on it, sets its
// `reviewed` to true and updates its date, and fills in CONTACT. Until then that page says it's a
// draft.
export const LEGAL = {
  PAGES: {
    // Back to draft on 2026-11-06: the policy now describes newly collected data (a verified email,
    // optional profile details, a picture, theme choices), which needs a fresh review (M11).
    // Rewritten in full on 2026-11-08 (legal bases, retention, cookies, rights); still a draft.
    // Updated on 2026-11-10: emails are now sent through Gmail over SMTP (M10).
    // Audited against the code on 2026-11-11 for hints, points, challenges, achievements, the
    // opt-in leaderboard and deletion from Settings → Danger zone; still a draft (M11).
    privacy: { reviewed: false, lastUpdated: "2026-11-12" },
    // Approved 2026-11-05 (M7). Back to draft on 2026-11-11: deletion moved to Settings, and the
    // terms now cover leaderboard names and points, which need the same review (M11).
    terms: { reviewed: false, lastUpdated: "2026-11-11" },
  },
  /** Where people write about their data, for example privacy@<domain>. Null until M7 sets it. */
  CONTACT: "anshiwang15@gmail.com" as string | null,
} as const;

export type LegalPageKey = keyof typeof LEGAL.PAGES;
