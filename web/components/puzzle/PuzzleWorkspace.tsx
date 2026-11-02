"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AnswerTray } from "@/components/puzzle/AnswerTray";
import { Attribution } from "@/components/puzzle/Attribution";
import { CodePanel } from "@/components/puzzle/CodePanel";
import { PromptPanel } from "@/components/puzzle/PromptPanel";
import { Splitter } from "@/components/puzzle/Splitter";
import styles from "@/components/puzzle/puzzle.module.css";
import type { Manifest, PuzzleDetail, PuzzleStatus, SubmitResponse } from "@/lib/api-types";
import { type DraftAction, draftReducer, elapsedMs, emptyDraft, toSubmission } from "@/lib/client/answer";
import { ApiRequestError, api } from "@/lib/client/api";
import { initialNavigation, navigationReducer } from "@/lib/client/navigation";
import { resolveManifestUrl } from "@/lib/client/snapshot-urls";

type ManifestState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; manifest: Manifest };

function nextStatus(current: PuzzleStatus, correct: boolean): PuzzleStatus {
  // Mirrors what the server records: solved is final. See spec section 9.
  if (current === "solved") return current;
  return correct ? "solved" : "attempted";
}

export function PuzzleWorkspace({ puzzle }: { puzzle: PuzzleDetail }) {
  const { me } = useAuth();
  const login = me?.user?.login ?? null;
  const signedOut = me !== null && me.user === null;

  const [draft, dispatchDraft] = useReducer(draftReducer, puzzle.answerKind, emptyDraft);
  const [navigation, navigate] = useReducer(navigationReducer, initialNavigation);
  const [manifestState, setManifestState] = useState<ManifestState>({ state: "loading" });
  const [manifestAttempt, setManifestAttempt] = useState(0);

  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [signInReason, setSignInReason] = useState<string | null>(null);
  // Newer than the page's props until the next refresh. Tied to the login, so signing in as someone
  // else falls back to the props, which the server has re-rendered for that user.
  const [localProgress, setLocalProgress] = useState<{
    login: string;
    status: PuzzleStatus;
    attempts: number;
  } | null>(null);
  const [startedAt] = useState(() => Date.now());

  const [leftWidth, setLeftWidth] = useState(290);
  const [rightWidth, setRightWidth] = useState(290);

  // A result belongs to the person who submitted it, so signing out takes it away.
  const shownResult = localProgress?.login === login ? result : null;
  const progress =
    localProgress && localProgress.login === login
      ? localProgress
      : { status: puzzle.status, attempts: puzzle.attempts };
  const unlocked = login !== null && progress.status === "solved";

  const manifestUrl = puzzle.snapshot.manifestUrl;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(resolveManifestUrl(manifestUrl));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as Manifest;
    })().then(
      (manifest) => {
        if (cancelled) return;
        setManifestState({ state: "ready", manifest });
        // Same first step as landing on a repo: read the README if there is one.
        const readme = manifest.files.find((file) => /^readme(\.[a-z]+)?$/i.test(file.path));
        if (readme) navigate({ type: "open", path: readme.path });
      },
      () => {
        if (!cancelled) {
          setManifestState({
            state: "error",
            message: "This snapshot's files couldn't be loaded.",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [manifestUrl, manifestAttempt]);

  const retryManifest = useCallback(() => {
    setManifestState({ state: "loading" });
    setManifestAttempt((attempt) => attempt + 1);
  }, []);

  const pick = useCallback((action: DraftAction) => {
    dispatchDraft(action);
    setResult(null);
    setSubmitError(null);
  }, []);

  const needSignIn = (reason: string) => setSignInReason(reason);

  const submit = async () => {
    const submission = toSubmission(draft, elapsedMs(startedAt, Date.now()));
    if (!submission || submitting) return;
    if (signedOut) {
      needSignIn("Sign in to submit. Your answer stays selected.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSignInReason(null);
    try {
      const response = await api.submit(puzzle.slug, submission);
      setResult(response);
      if (login) {
        setLocalProgress({
          login,
          status: nextStatus(progress.status, response.correct),
          attempts: response.attempts,
        });
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        needSignIn("Sign in to submit. Your answer stays selected.");
      } else {
        setSubmitError(error instanceof ApiRequestError ? error.message : "Submitting failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openFile = useCallback((path: string, line?: number, col?: number) => {
    navigate({ type: "open", path, line, col });
  }, []);

  const files = manifestState.state === "ready" ? manifestState.manifest.files : null;
  const filesByPath = useMemo(() => new Map((files ?? []).map((file) => [file.path, file])), [files]);

  return (
    <main
      className={styles.workspace}
      style={
        {
          "--left-width": `${leftWidth}px`,
          "--right-width": `${rightWidth}px`,
        } as React.CSSProperties
      }
    >
      <p className={styles.narrowNote}>
        The puzzle IDE is built for a laptop or larger screen. You can read everything here, but
        selecting code is easier with a mouse and a wider window.
      </p>
      <div className={styles.columns}>
        <PromptPanel
          puzzle={puzzle}
          status={progress.status}
          unlocked={unlocked}
        />
        <Splitter
          label="Resize the prompt panel"
          value={leftWidth}
          min={220}
          max={560}
          onChange={setLeftWidth}
        />
        <CodePanel
          snapshotId={puzzle.snapshot.id}
          manifestUrl={manifestUrl}
          repoUrl={puzzle.snapshot.repoUrl}
          sha={puzzle.snapshot.sha}
          manifestState={manifestState}
          onRetryManifest={retryManifest}
          files={files}
          filesByPath={filesByPath}
          navigation={navigation}
          navigate={navigate}
          openFile={openFile}
          draft={draft}
          pick={pick}
        />
        <Splitter
          label="Resize the answer tray"
          value={rightWidth}
          min={220}
          max={560}
          direction={-1}
          onChange={setRightWidth}
        />
        <AnswerTray
          puzzle={puzzle}
          draft={draft}
          pick={pick}
          onSubmit={() => void submit()}
          submitting={submitting}
          submitError={submitError}
          result={shownResult}
          attempts={progress.attempts}
          signInReason={signInReason}
          signedIn={login !== null}
        />
      </div>
      <Attribution snapshot={puzzle.snapshot} />
    </main>
  );
}
