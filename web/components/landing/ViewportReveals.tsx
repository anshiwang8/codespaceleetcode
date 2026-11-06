"use client";

import { useEffect } from "react";

/** Enhancement only: nothing is hidden while waiting for JS or an observer callback. */
export function ViewportReveals() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const regions = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-revealed", "true");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    regions.forEach((region) => observer.observe(region));
    return () => observer.disconnect();
  }, []);
  return null;
}
