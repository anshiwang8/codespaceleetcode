/** A code block's lines as the site numbers them: a trailing newline doesn't add an empty line. */
export function codeLines(source: string): string[] {
  return source.replace(/\n+$/, "").split("\n");
}
