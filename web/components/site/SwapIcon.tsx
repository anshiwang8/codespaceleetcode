"use client";

import { useState } from "react";
import { Icon, type IconName } from "./Icon";

interface SwapIconProps {
  name: IconName;
  size?: number;
}

/**
 * An icon that changes in place, such as a favorite's star or a sort direction. On a change the
 * old icon blurs out while the new one sharpens in, in the same box (`.icon-swap` in
 * app/globals.css). The first render doesn't animate, so a page full of them loads still.
 */
export function SwapIcon({ name, size }: SwapIconProps) {
  const [current, setCurrent] = useState(name);
  const [leaving, setLeaving] = useState<IconName | null>(null);
  const [swapped, setSwapped] = useState(false);
  // Adjusting state while rendering, as React documents for "storing information from previous
  // renders": no effect, so the new icon never paints a frame unanimated.
  if (current !== name) {
    setLeaving(current);
    setCurrent(name);
    setSwapped(true);
  }
  return (
    <span
      className="icon-swap"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.animationName === "icon-swap-out") setLeaving(null);
      }}
    >
      {leaving && leaving !== name ? <Icon key={`out-${leaving}`} name={leaving} size={size} className="icon-swap-out" /> : null}
      <Icon key={name} name={name} size={size} className={swapped ? "icon-swap-in" : undefined} />
    </span>
  );
}
