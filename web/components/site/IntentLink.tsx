"use client";

import Link from "next/link";
import { useState } from "react";

type IntentLinkProps = Omit<React.ComponentProps<typeof Link>, "prefetch">;

/**
 * A link that prefetches only once someone shows they might follow it: pointing at it, focusing
 * it, or touching it. Long lists use it (the puzzle table, history), where Next's usual
 * prefetch-on-scroll would render every visible row's page on the server: for a puzzle that's a
 * session lookup and a database query per link, most of them never opened.
 */
export function IntentLink({ onPointerEnter, onFocus, onTouchStart, ...props }: IntentLinkProps) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onPointerEnter={(event) => {
        setIntent(true);
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
