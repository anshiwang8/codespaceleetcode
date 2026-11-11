// The public name a user chooses for the leaderboard. Checked the same way in the browser and on
// the server. It's separate from the display name and the GitHub login, so joining never reveals
// either unless the user types it.

export const PUBLIC_NAME_MIN = 2;
export const PUBLIC_NAME_MAX = 30;

export type PublicNameResult = { ok: true; value: string } | { ok: false; error: string };

// Letters and numbers from any script, with spaces and . _ - ' between them (and a final period,
// as in an initial).
const ALLOWED = /^[\p{L}\p{N}](?:[\p{L}\p{N} ._'-]*[\p{L}\p{N}.])?$/u;

// Scripts a name's letters may come from. Mixing two is refused, so "Аlice" with a Cyrillic А
// can't sit beside "Alice". Japanese writing mixes three scripts, so they count as one.
const SCRIPTS: RegExp[] = [
  /\p{Script=Latin}/u,
  /\p{Script=Cyrillic}/u,
  /\p{Script=Greek}/u,
  /\p{Script=Armenian}/u,
  /\p{Script=Hebrew}/u,
  /\p{Script=Arabic}/u,
  /\p{Script=Devanagari}/u,
  /\p{Script=Thai}/u,
  /\p{Script=Hangul}/u,
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
];

function scriptsUsed(name: string): number {
  const used = new Set<number>();
  for (const char of name) {
    if (!/\p{L}/u.test(char)) continue;
    // -1 groups any other script on its own.
    used.add(SCRIPTS.findIndex((script) => script.test(char)));
  }
  return used.size;
}

export function publicNameField(value: unknown): PublicNameResult {
  if (typeof value !== "string") return { ok: false, error: "Enter a public name." };
  // NFKC folds look-alike forms such as fullwidth letters into the plain ones.
  const name = value.normalize("NFKC").trim().replace(/ {2,}/g, " ");
  const length = [...name].length;
  if (length < PUBLIC_NAME_MIN) return { ok: false, error: `Use at least ${PUBLIC_NAME_MIN} characters.` };
  if (length > PUBLIC_NAME_MAX) return { ok: false, error: `Use at most ${PUBLIC_NAME_MAX} characters.` };
  if (!ALLOWED.test(name)) {
    return { ok: false, error: "Use letters, numbers, spaces and . _ - ' only, starting with a letter or number." };
  }
  if (scriptsUsed(name) > 1) return { ok: false, error: "Use letters from one alphabet only." };
  return { ok: true, value: name };
}
