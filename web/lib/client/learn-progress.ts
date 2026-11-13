"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LEARN_GUEST_KEY as GUEST_KEY } from "@/lib/learn/storage";
import type { LearnProgressResponse, LessonProgress } from "@/lib/learn/types";

// Learn progress as the browser shows it. Signed in, it comes from GET /api/me/learn (only
// server-graded correct answers are ever recorded there) and is updated from each check's
// response. Signed out, it lives in this browser's localStorage under GUEST_KEY, and says so: it
// isn't an account result and is never copied into an account. Whoever is signed in owns the
// state; when that changes, it's dropped and loaded again for the new owner, so one person's
// progress never shows for another.


type Entries = Record<string, LessonProgress[]>;

interface State {
  /** "user:<login>" or "guest", or null while sign-in state is unknown. */
  owner: string | null;
  ready: boolean;
  failed: boolean;
  lessons: Entries;
}

let state: State = { owner: null, ready: false, failed: false, lessons: {} };
const listeners = new Set<() => void>();
let loadingFor: string | null = null;

function set(next: State): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => state;
const SERVER_STATE: State = { owner: null, ready: false, failed: false, lessons: {} };

function isProgress(value: unknown): value is LessonProgress {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.revision === "number" &&
    Array.isArray(entry.correct) &&
    entry.correct.every((item) => typeof item === "string") &&
    (entry.completedAt === null || typeof entry.completedAt === "string")
  );
}

function readGuest(): Entries {
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (typeof parsed !== "object" || parsed === null || (parsed as { v?: unknown }).v !== 1) return {};
    const lessons = (parsed as { lessons?: unknown }).lessons;
    if (typeof lessons !== "object" || lessons === null) return {};
    const entries: Entries = {};
    for (const [slug, list] of Object.entries(lessons as Record<string, unknown>)) {
      if (/^[a-z0-9-]{1,60}$/.test(slug) && Array.isArray(list)) entries[slug] = list.filter(isProgress).slice(0, 20);
    }
    return entries;
  } catch {
    return {};
  }
}

function writeGuest(lessons: Entries): void {
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify({ v: 1, lessons }));
  } catch {
    // Private mode or full storage: progress still shows for this visit.
  }
}

function fromResponse(response: LearnProgressResponse): Entries {
  const entries: Entries = {};
  for (const lesson of response.lessons) {
    (entries[lesson.slug] ??= []).push({ revision: lesson.revision, correct: lesson.correct, completedAt: lesson.completedAt });
  }
  return entries;
}

async function load(owner: string): Promise<void> {
  if (loadingFor === owner) return;
  loadingFor = owner;
  set({ owner, ready: false, failed: false, lessons: {} });
  if (owner === "guest") {
    set({ owner, ready: true, failed: false, lessons: readGuest() });
    loadingFor = null;
    return;
  }
  try {
    const response = await fetch("/api/me/learn", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as LearnProgressResponse;
    // Someone else may have signed in while this was loading; their state wins.
    if (state.owner === owner) set({ owner, ready: true, failed: false, lessons: fromResponse(body) });
  } catch {
    if (state.owner === owner) set({ owner, ready: true, failed: true, lessons: {} });
  } finally {
    if (loadingFor === owner) loadingFor = null;
  }
}

function replace(slug: string, entry: LessonProgress): void {
  const others = (state.lessons[slug] ?? []).filter((item) => item.revision !== entry.revision);
  const lessons = { ...state.lessons, [slug]: [entry, ...others].sort((a, b) => b.revision - a.revision) };
  set({ ...state, lessons });
  if (state.owner === "guest") writeGuest(lessons);
}

/** A check's result, for the owner it was made by. Ignored if someone else is signed in by now. */
export function recordCheck(
  owner: string | null,
  slug: string,
  revision: number,
  requiredIds: readonly string[],
  exerciseId: string,
  serverProgress: LessonProgress | null,
): void {
  if (owner === null || owner !== state.owner) return;
  if (serverProgress) {
    replace(slug, serverProgress);
    return;
  }
  if (owner !== "guest" || !requiredIds.includes(exerciseId)) return;
  const current = (state.lessons[slug] ?? []).find((item) => item.revision === revision);
  const correct = [...new Set([...(current?.correct ?? []), exerciseId])].sort();
  const done = requiredIds.every((id) => correct.includes(id));
  replace(slug, { revision, correct, completedAt: current?.completedAt ?? (done ? new Date().toISOString() : null) });
}

export { statusOf, type LessonStatus } from "@/lib/learn/status";

/** The progress store, for whoever is signed in now (or this browser's guest). */
export function useLearnProgress() {
  const { me } = useAuth();
  const owner = me === null ? null : me.user ? `user:${me.user.login}` : "guest";
  const current = useSyncExternalStore(subscribe, getState, () => SERVER_STATE);
  useEffect(() => {
    if (owner !== null && state.owner !== owner) void load(owner);
  }, [owner]);
  const matches = owner !== null && current.owner === owner;
  return {
    owner,
    signedIn: owner !== null && owner !== "guest",
    ready: matches && current.ready,
    failed: matches && current.failed,
    lessons: matches ? current.lessons : {},
  };
}
