import type { AnswerKind, Submission } from "@/lib/api-types";

// The answer being built in the tray. Every value here comes from a click on something the snapshot
// provided (spec rule 2). Nothing in this file knows or decides whether an answer is right.

export interface SequenceItem {
  /** Stable across reorders. A sequence may hold the same symbol twice, so the ID can't be the key. */
  key: number;
  id: string;
}

export type Draft =
  | { kind: "symbol"; id: string | null }
  | { kind: "file"; path: string | null }
  | { kind: "location"; id: string | null }
  | { kind: "sequence"; items: SequenceItem[]; nextKey: number }
  | { kind: "set"; ids: string[] }
  | { kind: "choice"; option: string | null };

export type DraftAction =
  | { type: "pick-symbol"; id: string }
  | { type: "pick-file"; path: string }
  | { type: "pick-location"; id: string }
  | { type: "pick-choice"; option: string }
  | { type: "move"; key: number; to: number }
  | { type: "remove"; id: string; key?: number }
  | { type: "clear" };

export function emptyDraft(kind: AnswerKind): Draft {
  switch (kind) {
    case "symbol":
      return { kind, id: null };
    case "file":
      return { kind, path: null };
    case "location":
      return { kind, id: null };
    case "sequence":
      return { kind, items: [], nextKey: 1 };
    case "set":
      return { kind, ids: [] };
    case "choice":
      return { kind, option: null };
  }
}

function toggled(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "pick-symbol":
      if (draft.kind === "symbol") return { ...draft, id: action.id };
      if (draft.kind === "set") return { ...draft, ids: toggled(draft.ids, action.id) };
      if (draft.kind === "sequence") {
        return {
          ...draft,
          items: [...draft.items, { key: draft.nextKey, id: action.id }],
          nextKey: draft.nextKey + 1,
        };
      }
      return draft;
    case "pick-file":
      if (draft.kind === "file") return { ...draft, path: action.path };
      if (draft.kind === "set") return { ...draft, ids: toggled(draft.ids, action.path) };
      return draft;
    case "pick-location":
      return draft.kind === "location" ? { ...draft, id: action.id } : draft;
    case "pick-choice":
      return draft.kind === "choice" ? { ...draft, option: action.option } : draft;
    case "move": {
      if (draft.kind !== "sequence") return draft;
      const from = draft.items.findIndex((item) => item.key === action.key);
      const item = draft.items[from];
      if (!item || action.to < 0 || action.to >= draft.items.length || action.to === from) return draft;
      const items = draft.items.filter((other) => other.key !== action.key);
      items.splice(action.to, 0, item);
      return { ...draft, items };
    }
    case "remove":
      if (draft.kind === "sequence") {
        return { ...draft, items: draft.items.filter((item) => item.key !== action.key) };
      }
      if (draft.kind === "set") return { ...draft, ids: draft.ids.filter((id) => id !== action.id) };
      return draft;
    case "clear":
      return emptyDraft(draft.kind);
  }
}

/** Whether the draft is ready to send. A set must hold exactly the required count. */
export function isReadyToSubmit(draft: Draft, setCount: number | null): boolean {
  switch (draft.kind) {
    case "symbol":
      return draft.id !== null;
    case "file":
      return draft.path !== null;
    case "location":
      return draft.id !== null;
    case "sequence":
      return draft.items.length > 0;
    case "set":
      return setCount === null ? draft.ids.length > 0 : draft.ids.length === setCount;
    case "choice":
      return draft.option !== null;
  }
}

/** Null while the draft has nothing to send. */
export function toSubmission(draft: Draft, timeOnPuzzleMs?: number): Submission | null {
  const time = timeOnPuzzleMs === undefined ? {} : { timeOnPuzzleMs };
  switch (draft.kind) {
    case "symbol":
      return draft.id === null ? null : { kind: "symbol", id: draft.id, ...time };
    case "file":
      return draft.path === null ? null : { kind: "file", path: draft.path, ...time };
    case "location":
      return draft.id === null ? null : { kind: "location", id: draft.id, ...time };
    case "sequence":
      return draft.items.length === 0
        ? null
        : { kind: "sequence", ids: draft.items.map((item) => item.id), ...time };
    case "set":
      return draft.ids.length === 0 ? null : { kind: "set", ids: draft.ids, ...time };
    case "choice":
      return draft.option === null ? null : { kind: "choice", option: draft.option, ...time };
  }
}

export interface PickLabel {
  /** The action's name on a button, like "Select as answer". */
  label: string;
  /** True when this exact value is already in the answer. */
  active: boolean;
}

/** What selecting this symbol would do, or null when this puzzle doesn't take symbols. */
export function symbolPick(draft: Draft, id: string): PickLabel | null {
  switch (draft.kind) {
    case "symbol":
      return { label: draft.id === id ? "Selected" : "Select as answer", active: draft.id === id };
    case "sequence":
      return { label: "Add to sequence", active: false };
    case "set":
      return draft.ids.includes(id)
        ? { label: "Remove from set", active: true }
        : { label: "Add to set", active: false };
    default:
      return null;
  }
}

/** What selecting this file would do, or null when this puzzle doesn't take files. */
export function filePick(draft: Draft, path: string): PickLabel | null {
  switch (draft.kind) {
    case "file":
      return { label: draft.path === path ? "Selected" : "Select as answer", active: draft.path === path };
    case "set":
      return draft.ids.includes(path)
        ? { label: "Remove from set", active: true }
        : { label: "Add to set", active: false };
    default:
      return null;
  }
}

export interface LineRange {
  startLine: number;
  endLine: number;
}

interface EditorSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/**
 * The lines an editor selection covers, or null for a bare cursor. A selection that ends at column 1
 * of a line doesn't include that line: that's what dragging or clicking in the gutter produces.
 */
export function selectionToLines(selection: EditorSelection): LineRange | null {
  const { startLineNumber, startColumn, endLineNumber, endColumn } = selection;
  if (startLineNumber === endLineNumber && startColumn === endColumn) return null;
  const endLine = endColumn === 1 && endLineNumber > startLineNumber ? endLineNumber - 1 : endLineNumber;
  return { startLine: startLineNumber, endLine };
}

/** The canonical location ID from spec section 3. */
export function locationId(path: string, range: LineRange): string {
  return `${path}:L${range.startLine}-L${range.endLine}`;
}

const JS_MAX_INT4 = 2_147_483_647;

/** Elapsed time clamped to what the submit route accepts. */
export function elapsedMs(startedAt: number, now: number): number {
  return Math.min(Math.max(0, Math.round(now - startedAt)), JS_MAX_INT4);
}
