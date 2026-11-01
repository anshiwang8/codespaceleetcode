import { describe, expect, it } from "vitest";
import { ancestorsOf, buildTree } from "@/lib/client/file-tree";
import { initialNavigation, navigationReducer, type NavigationState, TRAIL_LIMIT } from "@/lib/client/navigation";
import { githubFileUrl, resolveManifestUrl, snapshotFileUrl } from "@/lib/client/snapshot-urls";

const file = (path: string) => ({ path, size: 1, language: "other" });
const open = (state: NavigationState, path: string, line?: number) =>
  navigationReducer(state, { type: "open", path, line });

describe("buildTree", () => {
  it("puts folders first, then files, each sorted", () => {
    const tree = buildTree([file("b.ts"), file("src/z.ts"), file("a.ts"), file("src/lib/y.ts"), file("src/a.ts")]);
    expect(tree.map((node) => node.name)).toEqual(["src", "a.ts", "b.ts"]);
    const src = tree[0]?.children ?? [];
    expect(src.map((node) => node.path)).toEqual(["src/lib", "src/a.ts", "src/z.ts"]);
    expect(src[0]?.children?.[0]?.path).toBe("src/lib/y.ts");
    expect(tree[1]?.children).toBeNull();
  });

  it("handles an empty manifest", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("ancestorsOf", () => {
  it("lists containing folders, outermost first", () => {
    expect(ancestorsOf("a/b/c.ts")).toEqual(["a", "a/b"]);
    expect(ancestorsOf("c.ts")).toEqual([]);
  });
});

describe("navigationReducer", () => {
  it("opening a file updates tabs, the trail and the tree together", () => {
    const state = open(initialNavigation, "src/lib/a.ts", 12);
    expect(state.activePath).toBe("src/lib/a.ts");
    expect(state.tabs).toEqual(["src/lib/a.ts"]);
    expect(state.trail).toEqual(["src/lib/a.ts"]);
    expect(state.expanded).toEqual(["src", "src/lib"]);
    expect(state.reveal).toMatchObject({ path: "src/lib/a.ts", line: 12, col: 1 });
  });

  it("gives each reveal of the same line a new nonce", () => {
    const first = open(initialNavigation, "a.ts", 3);
    const second = open(first, "a.ts", 3);
    expect(second.reveal?.nonce).not.toBe(first.reveal?.nonce);
    expect(second.tabs).toEqual(["a.ts"]);
    expect(second.trail).toEqual(["a.ts"]);
  });

  it("moves a revisited file to the end of the trail and caps its length", () => {
    let state = open(open(open(initialNavigation, "a"), "b"), "a");
    expect(state.trail).toEqual(["b", "a"]);
    for (let index = 0; index < TRAIL_LIMIT + 5; index += 1) state = open(state, `f${index}`);
    expect(state.trail).toHaveLength(TRAIL_LIMIT);
    expect(state.trail.at(-1)).toBe(`f${TRAIL_LIMIT + 4}`);
  });

  it("closing the active tab activates its neighbour, and the last leaves nothing open", () => {
    let state = open(open(open(initialNavigation, "a"), "b"), "c");
    state = navigationReducer(state, { type: "close", path: "c" });
    expect(state.activePath).toBe("b");
    state = navigationReducer(state, { type: "close", path: "a" });
    expect(state.activePath).toBe("b");
    state = navigationReducer(state, { type: "close", path: "b" });
    expect(state.activePath).toBeNull();
    expect(state.tabs).toEqual([]);
  });

  it("toggles a folder without touching what's open", () => {
    const opened = open(initialNavigation, "src/a.ts");
    const closed = navigationReducer(opened, { type: "toggle-dir", path: "src" });
    expect(closed.expanded).toEqual([]);
    expect(closed.activePath).toBe("src/a.ts");
    expect(navigationReducer(closed, { type: "toggle-dir", path: "src" }).expanded).toEqual(["src"]);
  });
});

describe("snapshot URLs", () => {
  const manifest = "/snapshots/x@abc/manifest.json";

  it("stays on this site with no CDN", () => {
    expect(resolveManifestUrl(manifest, "")).toBe(manifest);
    expect(snapshotFileUrl(manifest, "src/a.ts", "")).toBe("/snapshots/x@abc/files/src/a.ts");
  });

  it("goes to the CDN when one is set", () => {
    expect(resolveManifestUrl(manifest, "https://cdn.example")).toBe(`https://cdn.example${manifest}`);
    expect(snapshotFileUrl(manifest, "a.ts", "https://cdn.example")).toBe(
      "https://cdn.example/snapshots/x@abc/files/a.ts",
    );
  });

  it("leaves an already absolute manifest URL alone", () => {
    const absolute = "https://r2.example/snapshots/x@abc/manifest.json";
    expect(resolveManifestUrl(absolute, "https://cdn.example")).toBe(absolute);
    expect(snapshotFileUrl(absolute, "a.ts", "")).toBe("https://r2.example/snapshots/x@abc/files/a.ts");
  });

  it("encodes each path segment and keeps the slashes", () => {
    expect(snapshotFileUrl(manifest, "logo/Logo Outer#1.ai", "")).toBe(
      "/snapshots/x@abc/files/logo/Logo%20Outer%231.ai",
    );
    expect(githubFileUrl("https://github.com/x/y", "abc", "a b/c.ts")).toBe(
      "https://github.com/x/y/blob/abc/a%20b/c.ts",
    );
  });
});
