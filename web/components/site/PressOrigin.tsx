"use client";

import { useEffect } from "react";

/**
 * Records where a press on a primary button began, as --press-x and --press-y on that button, so
 * the press highlight in app/globals.css spreads from the pointer. Mounted once in the root
 * layout; renders nothing. Without it the highlight sits at the button's center.
 */
export function PressOrigin() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>(".btn-primary");
      if (!button) return;
      const box = button.getBoundingClientRect();
      button.style.setProperty("--press-x", `${Math.round(event.clientX - box.left)}px`);
      button.style.setProperty("--press-y", `${Math.round(event.clientY - box.top)}px`);
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  return null;
}
