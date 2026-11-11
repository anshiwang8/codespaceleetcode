"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/site/Icon";
import styles from "@/components/site/toast.module.css";

export interface ToastMessage {
  /** Unique among the toasts on screen. */
  id: string;
  /** A short line above the title, such as "Achievement unlocked". */
  eyebrow?: string;
  title: string;
  body?: string;
  icon?: IconName;
  link?: { href: string; label: string };
}

/** How long a toast stays when nobody is hovering over or focused in it. */
export const TOAST_DURATION_MS = 6000;

interface ToastRegionProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
  /** Names the region for screen readers. */
  label?: string;
}

/**
 * Small notices in the bottom-left corner. Not a dialog: nothing takes focus, and the page stays
 * usable. The live region is always mounted, so a toast added later is announced. Each toast leaves
 * on its own after a few seconds, waits while it's hovered or focused, and has a dismiss button.
 */
export function ToastRegion({ toasts, onDismiss, label = "Notifications" }: ToastRegionProps) {
  return (
    <section className={styles.region} aria-label={label}>
      <ol className={styles.list} role="status" aria-live="polite" aria-relevant="additions" data-testid="toasts">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </ol>
    </section>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(TOAST_DURATION_MS);
  const paused = hovered || focused;

  // Counts down only while nobody is reading it, and picks up where it stopped.
  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1000, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, onDismiss, toast.id]);

  return (
    <li
      className={styles.toast}
      data-testid="toast"
      data-paused={paused}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {toast.icon ? (
        <span className={styles.icon} aria-hidden="true">
          <Icon name={toast.icon} />
        </span>
      ) : null}
      <div className={styles.content}>
        {toast.eyebrow ? <p className={styles.eyebrow}>{toast.eyebrow}</p> : null}
        <p className={styles.title}>{toast.title}</p>
        {toast.body ? <p className={styles.body}>{toast.body}</p> : null}
        {toast.link ? (
          <Link href={toast.link.href} className={styles.link}>
            {toast.link.label}
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        className={`btn btn-small btn-quiet ${styles.dismiss}`}
        aria-label={`Dismiss: ${toast.title}`}
        onClick={() => onDismiss(toast.id)}
        data-testid="toast-dismiss"
      >
        <Icon name="x" />
      </button>
    </li>
  );
}
