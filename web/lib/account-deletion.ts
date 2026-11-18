// Account deletion, shared by Settings and DELETE /api/me (spec section 8, "Deleting an account").

/** The word the user types to confirm. Compared exactly, case included. */
export const DELETE_CONFIRMATION = "DELETE";

/** What deleting a codebases account removes, in the words Settings shows before it happens. */
export const DELETED_DATA = [
  "Your codebases account and every active session on any device",
  "Your link to your GitHub account, and the GitHub access token stored for it",
  "Every submission, your progress on every puzzle, and the solutions you unlocked",
  "Revealed hints, points, challenge completions, streaks and achievements",
  "Your Learn progress",
  "Your leaderboard entry and public name",
  "Your profile details, links, picture, theme preference and contact email",
] as const;
