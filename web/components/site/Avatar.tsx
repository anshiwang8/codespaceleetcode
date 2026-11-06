"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/site/avatar.module.css";

interface AvatarProps {
  /** The uploaded picture's version, or null for the default silhouette. */
  version: string | null;
  size?: "small" | "large" | "xlarge";
  /**
   * An accessible name, when nothing next to the avatar already names the person. Without one
   * the avatar is decorative.
   */
  label?: string;
  /** Shows this image instead (a local preview while cropping). */
  previewSrc?: string;
}

/**
 * The user's picture, or the default: a plain white head-and-shoulders silhouette on a neutral gray
 * circle, drawn here in SVG. A missing, removed or broken picture falls back to the silhouette.
 * GitHub's avatar is never used.
 */
export function Avatar({ version, size = "small", label, previewSrc }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = previewSrc ?? (version ? `/api/me/avatar?v=${encodeURIComponent(version)}` : null);
  const sizeClass = size === "xlarge" ? styles.xlarge : size === "large" ? styles.large : styles.small;
  const image = useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before React attaches onError, so check once it's mounted.
  useEffect(() => {
    const element = image.current;
    if (src && element?.complete && element.naturalWidth === 0) setFailed(src);
  }, [src]);
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  if (src && failed !== src) {
    return (
      <span className={`${styles.avatar} ${sizeClass}`} {...a11y} data-testid="avatar" data-kind="picture">
        {/* eslint-disable-next-line @next/next/no-img-element -- a private, same-origin, already-sized image */}
        <img ref={image} src={src} alt="" className={styles.image} onError={() => setFailed(src)} draggable={false} />
      </span>
    );
  }
  return (
    <span className={`${styles.avatar} ${sizeClass}`} {...a11y} data-testid="avatar" data-kind="silhouette">
      <svg viewBox="0 0 64 64" className={styles.silhouette} focusable="false" aria-hidden="true">
        <circle cx="32" cy="24.5" r="11" />
        <path d="M11 55.5c0-11.3 9.4-19 21-19s21 7.7 21 19v2.5H11z" />
      </svg>
    </span>
  );
}
