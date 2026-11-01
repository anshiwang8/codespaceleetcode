"use client";

import { useRef } from "react";
import styles from "@/components/puzzle/puzzle.module.css";

const KEY_STEP = 24;

interface SplitterProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** -1 when the panel being sized is to the right of this splitter. */
  direction?: 1 | -1;
  onChange: (value: number) => void;
}

/** A draggable divider between panels. Arrow keys move it too. */
export function Splitter({ label, value, min, max, direction = 1, onChange }: SplitterProps) {
  const drag = useRef<{ startX: number; startValue: number } | null>(null);
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={styles.splitter}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startValue: value };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const delta = (event.clientX - drag.current.startX) * direction;
        onChange(clamp(drag.current.startValue + delta));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(clamp(value - KEY_STEP * direction));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(clamp(value + KEY_STEP * direction));
        }
      }}
    />
  );
}
