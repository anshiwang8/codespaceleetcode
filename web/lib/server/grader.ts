import "server-only";
import { z } from "zod";
import type { Submission } from "@/lib/api-types";

// Spec section 3. Every comparison here is exact: no trimming, case folding or path normalizing.

const lineRange = z
  .tuple([z.number().int().positive(), z.number().int().positive()])
  .refine(([first, last]) => first <= last);

export const answerKeySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("symbol"),
    id: z.string().min(1),
    accept: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
    accept: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal("location"),
    path: z.string().min(1),
    anchor: lineRange,
    window: lineRange,
  }),
  z.object({
    kind: z.literal("sequence"),
    ids: z.array(z.string()).min(1),
    accept_sequences: z.array(z.array(z.string()).min(1)).default([]),
  }),
  z.object({ kind: z.literal("set"), ids: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("choice"), option: z.string().min(1) }),
]);

export type AnswerKey = z.infer<typeof answerKeySchema>;

export interface ParsedLocation {
  path: string;
  start: number;
  end: number;
}

/** `path:Lstart-Lend`. Paths may contain colons, so the line span is matched from the end. */
export function parseLocationId(id: string): ParsedLocation | null {
  const match = /^(.+):L([1-9][0-9]*)-L([1-9][0-9]*)$/.exec(id);
  if (!match) return null;
  const [, path, first, last] = match;
  if (path === undefined || first === undefined || last === undefined) return null;
  const start = Number(first);
  const end = Number(last);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return null;
  return { path, start, end };
}

function sameOrder(submitted: string[], expected: string[]): boolean {
  return (
    submitted.length === expected.length && submitted.every((id, i) => id === expected[i])
  );
}

function sameSet(submitted: string[], expected: string[]): boolean {
  const wanted = new Set(expected);
  // Comparing against the raw length is what makes a duplicate submission incorrect.
  return (
    submitted.length === wanted.size &&
    new Set(submitted).size === submitted.length &&
    submitted.every((id) => wanted.has(id))
  );
}

function gradeLocation(key: Extract<AnswerKey, { kind: "location" }>, id: string): boolean {
  const selection = parseLocationId(id);
  if (!selection || selection.path !== key.path) return false;
  const [anchorFirst, anchorLast] = key.anchor;
  const [windowFirst, windowLast] = key.window;
  const coversAnchor = selection.start <= anchorFirst && selection.end >= anchorLast;
  const insideWindow = selection.start >= windowFirst && selection.end <= windowLast;
  return coversAnchor && insideWindow;
}

export function grade(key: AnswerKey, submission: Submission): boolean {
  switch (key.kind) {
    case "symbol":
      return (
        submission.kind === "symbol" &&
        (submission.id === key.id || key.accept.includes(submission.id))
      );
    case "file":
      return (
        submission.kind === "file" &&
        (submission.path === key.path || key.accept.includes(submission.path))
      );
    case "location":
      return submission.kind === "location" && gradeLocation(key, submission.id);
    case "sequence":
      return (
        submission.kind === "sequence" &&
        [key.ids, ...key.accept_sequences].some((ids) => sameOrder(submission.ids, ids))
      );
    case "set":
      return submission.kind === "set" && sameSet(submission.ids, key.ids);
    case "choice":
      return submission.kind === "choice" && submission.option === key.option;
  }
}
