"use client";

import { useEffect } from "react";

/**
 * While a form has unsaved changes, leaving or reloading the page asks first. (Links inside the app
 * don't trigger this; each form keeps its own Save and Cancel.)
 */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** Pending, saved or failed, for the line next to a form's buttons. */
export type SaveState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saved"; text: string }
  | { kind: "error"; text: string };
