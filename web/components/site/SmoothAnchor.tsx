"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

/** How long to wait for a scroll to finish where the browser has no `scrollend` event. */
const SCROLL_FALLBACK_MS = 1200;

let latest = 0;

interface FollowOptions {
  /** Called with the target's id as the scroll starts. */
  onStart?: (id: string) => void;
  /** Called when this scroll ends, unless a later click has taken over. */
  onEnd?: (id: string) => void;
}

/**
 * Follows a link to a place on the same page by scrolling there, instead of jumping. The address
 * gets the hash, the target's `scroll-margin-top` is honored, and when the scroll ends focus moves
 * to the target, so the keyboard and a screen reader land where the eye did. With reduced motion
 * the scroll is instant. A modified click (new tab or window) is left to the browser, and so is a
 * link whose target isn't on the page.
 */
export function followAnchor(event: MouseEvent<HTMLAnchorElement>, { onStart, onEnd }: FollowOptions = {}): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const hash = event.currentTarget.hash;
  const id = decodeURIComponent(hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  if (!target) return;
  event.preventDefault();

  const run = ++latest;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  onStart?.(id);

  // The address changes once the scroll has ended: the router answers a changed hash, and doing
  // that mid-scroll would stop the scroll where it started.
  const finish = () => {
    if (run !== latest) return;
    window.history.replaceState(window.history.state, "", hash);
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    onEnd?.(id);
  };

  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  if (reduced) {
    finish();
    return;
  }
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    document.removeEventListener("scrollend", once);
    finish();
  };
  const timer = window.setTimeout(once, SCROLL_FALLBACK_MS);
  document.addEventListener("scrollend", once);
}

/** An in-page link that scrolls to its target (see `followAnchor`). */
export function SmoothAnchor({ onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        followAnchor(event);
      }}
    />
  );
}
