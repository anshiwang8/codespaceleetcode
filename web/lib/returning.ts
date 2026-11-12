/**
 * Whether someone has signed in on this browser, so the landing page can greet them with a way
 * straight back to the puzzles instead of a sign-in button. It's a flag, not an identity: the value
 * is always "1", it's never sent to the server, and it's cleared on sign-out and account deletion.
 */

export const SIGNED_IN_KEY = "cb-signed-in";

/** The attribute on <html> that the landing page's CSS reads to pick its hero buttons. */
export const RETURNING_ATTRIBUTE = "data-returning";

/**
 * A fixed string, no user data. Runs in <head> before first paint, so a returning visitor never
 * sees the sign-in button flash before "To puzzles" replaces it.
 */
export const RETURNING_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(SIGNED_IN_KEY)})==="1")document.documentElement.setAttribute(${JSON.stringify(RETURNING_ATTRIBUTE)},"")}catch(x){}})();`;

export function wasSignedIn(): boolean {
  try {
    return window.localStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sets or clears the <html> attribute from what this browser remembers. */
export function syncReturningAttribute(): void {
  if (wasSignedIn()) document.documentElement.setAttribute(RETURNING_ATTRIBUTE, "");
  else document.documentElement.removeAttribute(RETURNING_ATTRIBUTE);
}

export function rememberSignedIn(): void {
  try {
    window.localStorage.setItem(SIGNED_IN_KEY, "1");
  } catch {
    // Storage blocked: the landing page shows the sign-in button, which still works.
  }
}

export function forgetSignedIn(): void {
  try {
    window.localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // Nothing was stored.
  }
  document.documentElement.removeAttribute(RETURNING_ATTRIBUTE);
}
