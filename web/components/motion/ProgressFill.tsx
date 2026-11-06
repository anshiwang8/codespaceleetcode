import type { CSSProperties } from "react";

/** A stable, compositor-only fill. Existing DOM transitions from its previous value. */
export function ProgressFill({ percent }: { percent: number }) {
  return <span className="progress-fill" style={{ "--progress": Math.min(100, Math.max(0, percent)) / 100 } as CSSProperties} />;
}
