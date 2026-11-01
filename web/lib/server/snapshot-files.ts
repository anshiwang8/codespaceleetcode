import "server-only";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

// The localhost stand-in for the CDN: serves `manifest.json` and `files/<path>` from an ingest
// output folder, and nothing else in it (symbols.jsonl and the rest aren't for clients).

const SNAPSHOT_NAME = /^[a-z0-9][a-z0-9._-]*@[0-9a-f]{40}$/;

/** Localhost mode only: a production build serves nothing unless SNAPSHOT_DIR is set on purpose. */
function snapshotRoot(): string | null {
  const configured = process.env.SNAPSHOT_DIR;
  if (configured) return path.resolve(/*turbopackIgnore: true*/ configured);
  if (process.env.NODE_ENV === "production") return null;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "../ingest/out");
}

function isUnsafeSegment(segment: string): boolean {
  return (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    /[/\\:\0-\x1f]/.test(segment) ||
    // Windows ignores trailing dots and spaces, which would turn ".. " into "..".
    /[. ]$/.test(segment)
  );
}

/** Also looks one decode deeper, so a double-encoded separator is refused rather than trusted. */
function isSafeSegment(segment: string): boolean {
  if (isUnsafeSegment(segment)) return false;
  try {
    return !isUnsafeSegment(decodeURIComponent(segment));
  } catch {
    return true; // A stray % isn't an encoding, so there's nothing further to check.
  }
}

function isInside(base: string, target: string): boolean {
  const relative = path.relative(base, target);
  return (
    relative !== "" && relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative)
  );
}

export interface SnapshotFile {
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
}

export async function readSnapshotFile(
  name: string,
  segments: string[],
): Promise<SnapshotFile | null> {
  const root = snapshotRoot();
  if (!root || !SNAPSHOT_NAME.test(name) || !segments.every(isSafeSegment)) return null;

  const isManifest = segments.length === 1 && segments[0] === "manifest.json";
  const isSourceFile = segments.length >= 2 && segments[0] === "files";
  if (!isManifest && !isSourceFile) return null;

  // turbopackIgnore: these paths are only known at request time, and without it the build traces
  // the whole project into the server output, solutions included.
  const snapshotDir = path.join(/*turbopackIgnore: true*/ root, name);
  const base = isManifest
    ? snapshotDir
    : path.join(/*turbopackIgnore: true*/ snapshotDir, "files");
  const target = path.resolve(/*turbopackIgnore: true*/ snapshotDir, ...segments);
  if (!isInside(base, target)) return null;

  try {
    // realpath also catches a symlink that points outside the snapshot.
    const [realBase, realTarget] = await Promise.all([realpath(base), realpath(target)]);
    if (!isInside(realBase, realTarget) || !(await stat(realTarget)).isFile()) return null;
    return {
      body: new Uint8Array(await readFile(realTarget)),
      contentType: isManifest ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    };
  } catch {
    return null;
  }
}
