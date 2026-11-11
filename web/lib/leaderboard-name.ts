// The public name a user chooses for the leaderboard. Checked the same way in the browser and on
// the server. It's separate from the display name and the GitHub login, so joining never reveals
// either unless the user types it.

export const PUBLIC_NAME_MIN = 2;
export const PUBLIC_NAME_MAX = 30;

export type PublicNameResult = { ok: true; value: string } | { ok: false; error: string };

// Letters and numbers from any script, with spaces and . _ - ' between them (and a final period,
// as in an initial).
const ALLOWED = /^[\p{L}\p{N}](?:[\p{L}\p{N} ._'-]*[\p{L}\p{N}.])?$/u;

export function publicNameField(value: unknown): PublicNameResult {
  if (typeof value !== "string") return { ok: false, error: "Enter a public name." };
  const name = value.normalize("NFC").trim().replace(/ {2,}/g, " ");
  const length = [...name].length;
  if (length < PUBLIC_NAME_MIN) return { ok: false, error: `Use at least ${PUBLIC_NAME_MIN} characters.` };
  if (length > PUBLIC_NAME_MAX) return { ok: false, error: `Use at most ${PUBLIC_NAME_MAX} characters.` };
  if (!ALLOWED.test(name)) {
    return { ok: false, error: "Use letters, numbers, spaces and . _ - ' only, starting with a letter or number." };
  }
  return { ok: true, value: name };
}
