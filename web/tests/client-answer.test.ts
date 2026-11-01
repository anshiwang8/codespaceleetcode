import { describe, expect, it } from "vitest";
import {
  draftReducer,
  elapsedMs,
  emptyDraft,
  filePick,
  isReadyToSubmit,
  locationId,
  selectionToLines,
  symbolPick,
  toSubmission,
} from "@/lib/client/answer";

const selection = (startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) => ({
  startLineNumber,
  startColumn,
  endLineNumber,
  endColumn,
});

describe("selectionToLines", () => {
  it("treats a bare cursor as no selection", () => {
    expect(selectionToLines(selection(4, 3, 4, 3))).toBeNull();
  });

  it("keeps a partial selection inside one line", () => {
    expect(selectionToLines(selection(4, 3, 4, 9))).toEqual({ startLine: 4, endLine: 4 });
  });

  it("leaves out a last line the selection only touches at column 1", () => {
    expect(selectionToLines(selection(4, 1, 6, 1))).toEqual({ startLine: 4, endLine: 5 });
  });

  it("keeps a last line with any of it selected", () => {
    expect(selectionToLines(selection(4, 1, 6, 2))).toEqual({ startLine: 4, endLine: 6 });
  });
});

describe("locationId", () => {
  it("is the canonical path:Lstart-Lend form", () => {
    expect(locationId("src/a b.ts", { startLine: 3, endLine: 12 })).toBe("src/a b.ts:L3-L12");
  });
});

describe("draftReducer", () => {
  it("replaces a single symbol, and clears", () => {
    let draft = emptyDraft("symbol");
    draft = draftReducer(draft, { type: "pick-symbol", id: "a#x" });
    draft = draftReducer(draft, { type: "pick-symbol", id: "a#y" });
    expect(toSubmission(draft)).toEqual({ kind: "symbol", id: "a#y" });
    expect(toSubmission(draftReducer(draft, { type: "clear" }))).toBeNull();
  });

  it("ignores a pick the puzzle doesn't take", () => {
    const draft = emptyDraft("file");
    expect(draftReducer(draft, { type: "pick-symbol", id: "a#x" })).toEqual(draft);
    expect(draftReducer(emptyDraft("symbol"), { type: "pick-file", path: "a" })).toEqual(emptyDraft("symbol"));
  });

  it("keeps sequence order, allows repeats, moves and removes by key", () => {
    let draft = emptyDraft("sequence");
    for (const id of ["a#1", "a#2", "a#1"]) draft = draftReducer(draft, { type: "pick-symbol", id });
    if (draft.kind !== "sequence") throw new Error("wrong kind");
    expect(draft.items.map((item) => item.id)).toEqual(["a#1", "a#2", "a#1"]);

    const lastKey = draft.items[2]?.key ?? 0;
    const moved = draftReducer(draft, { type: "move", key: lastKey, to: 1 });
    expect(toSubmission(moved)).toEqual({ kind: "sequence", ids: ["a#1", "a#1", "a#2"] });

    // Only the item with this key goes, not its twin with the same ID.
    const removed = draftReducer(draft, { type: "remove", id: "a#1", key: lastKey });
    expect(toSubmission(removed)).toEqual({ kind: "sequence", ids: ["a#1", "a#2"] });
  });

  it("doesn't move past either end of a sequence", () => {
    let draft = emptyDraft("sequence");
    draft = draftReducer(draft, { type: "pick-symbol", id: "a#1" });
    if (draft.kind !== "sequence") throw new Error("wrong kind");
    const key = draft.items[0]?.key ?? 0;
    expect(draftReducer(draft, { type: "move", key, to: -1 })).toBe(draft);
    expect(draftReducer(draft, { type: "move", key, to: 1 })).toBe(draft);
  });

  it("toggles set members across files and symbols", () => {
    let draft = emptyDraft("set");
    draft = draftReducer(draft, { type: "pick-file", path: "a.ts" });
    draft = draftReducer(draft, { type: "pick-symbol", id: "a.ts#x" });
    expect(toSubmission(draft)).toEqual({ kind: "set", ids: ["a.ts", "a.ts#x"] });
    draft = draftReducer(draft, { type: "pick-file", path: "a.ts" });
    expect(toSubmission(draft)).toEqual({ kind: "set", ids: ["a.ts#x"] });
  });
});

describe("isReadyToSubmit", () => {
  it("needs exactly the stated count for a set", () => {
    let draft = emptyDraft("set");
    expect(isReadyToSubmit(draft, 2)).toBe(false);
    draft = draftReducer(draft, { type: "pick-file", path: "a" });
    expect(isReadyToSubmit(draft, 2)).toBe(false);
    draft = draftReducer(draft, { type: "pick-file", path: "b" });
    expect(isReadyToSubmit(draft, 2)).toBe(true);
    draft = draftReducer(draft, { type: "pick-file", path: "c" });
    expect(isReadyToSubmit(draft, 2)).toBe(false);
  });

  it("is false for every empty draft", () => {
    for (const kind of ["symbol", "file", "location", "sequence", "set", "choice"] as const) {
      expect(isReadyToSubmit(emptyDraft(kind), null)).toBe(false);
      expect(toSubmission(emptyDraft(kind))).toBeNull();
    }
  });
});

describe("toSubmission", () => {
  it("builds the Submission shape for each single-value kind, with the time", () => {
    const location = draftReducer(emptyDraft("location"), { type: "pick-location", id: "a:L1-L2" });
    expect(toSubmission(location, 5)).toEqual({ kind: "location", id: "a:L1-L2", timeOnPuzzleMs: 5 });
    const choice = draftReducer(emptyDraft("choice"), { type: "pick-choice", option: "b" });
    expect(toSubmission(choice)).toEqual({ kind: "choice", option: "b" });
    const file = draftReducer(emptyDraft("file"), { type: "pick-file", path: "a" });
    expect(toSubmission(file)).toEqual({ kind: "file", path: "a" });
  });
});

describe("pick labels", () => {
  it("says what the click will do", () => {
    expect(symbolPick(emptyDraft("symbol"), "a#x")?.label).toBe("Select as answer");
    expect(symbolPick(emptyDraft("sequence"), "a#x")?.label).toBe("Add to sequence");
    expect(symbolPick(emptyDraft("file"), "a#x")).toBeNull();
    expect(filePick(emptyDraft("symbol"), "a")).toBeNull();
    const set = draftReducer(emptyDraft("set"), { type: "pick-file", path: "a" });
    expect(filePick(set, "a")).toEqual({ label: "Remove from set", active: true });
    expect(filePick(set, "b")).toEqual({ label: "Add to set", active: false });
  });
});

describe("elapsedMs", () => {
  it("stays in the range the submit route accepts", () => {
    expect(elapsedMs(100, 350)).toBe(250);
    expect(elapsedMs(350, 100)).toBe(0);
    expect(elapsedMs(0, 10 ** 13)).toBe(2_147_483_647);
  });
});
