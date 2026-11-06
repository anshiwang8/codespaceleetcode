"use client";

import { useRef, useState } from "react";
import styles from "@/components/themes/themes.module.css";
import { ThemePicker } from "@/components/themes/ThemePicker";

/**
 * The profile page's way into the theme picker, in a dialog. Closing it any way other than Apply
 * (Cancel, Escape, the backdrop) puts the saved theme back, and focus returns to this button.
 */
export function ThemeButton({ className = "" }: { className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    setOpen(true);
    dialogRef.current?.showModal();
  };
  const close = () => {
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className={`btn ${styles.themeButton} ${className}`}
        onClick={show}
        aria-haspopup="dialog"
        data-testid="theme-button"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
        </svg>
        Theme
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="theme-dialog-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself, outside its content) closes it.
          if (event.target === dialogRef.current) close();
        }}
        data-testid="theme-dialog"
      >
        <div className={styles.dialogHead}>
          <h2 id="theme-dialog-title" className="section-title">
            Theme
          </h2>
          <button type="button" className="btn btn-small btn-quiet" onClick={close} aria-label="Close">
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        {open ? <ThemePicker variant="dialog" onClose={close} /> : null}
      </dialog>
    </>
  );
}
