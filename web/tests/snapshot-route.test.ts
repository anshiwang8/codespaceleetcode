import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/snapshots/[name]/[...path]/route";
import { makeRequest, params } from "./helpers";

const NAME = `acme-router@${"a".repeat(40)}`;
const SECRET = "OUTSIDE_THE_SNAPSHOT";

function get(name: string, segments: string[]): Promise<Response> {
  return GET(
    makeRequest(`/snapshots/x/${segments.length}`),
    params({ name, path: segments }),
  );
}

describe("/snapshots/<name>/<path>", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "cp-snapshots-"));
    const snapshot = path.join(root, NAME);
    mkdirSync(path.join(snapshot, "files", "src", "deep"), { recursive: true });
    writeFileSync(path.join(snapshot, "manifest.json"), '{"slug":"acme-router"}');
    writeFileSync(path.join(snapshot, "symbols.jsonl"), SECRET);
    writeFileSync(path.join(snapshot, "occurrences.jsonl"), SECRET);
    writeFileSync(path.join(snapshot, "files", "src", "app.ts"), "export const app = 1;\n");
    writeFileSync(path.join(snapshot, "files", "src", "deep", "x.ts"), "deep\n");
    writeFileSync(path.join(snapshot, "files", "src", "my file.ts"), "spaced\n");
    writeFileSync(path.join(snapshot, "files", "src", "100%.ts"), "percent\n");
    writeFileSync(path.join(snapshot, "files", "manifest.json"), "a file in the repo\n");
    writeFileSync(path.join(snapshot, "files", ".gitignore"), "dotfile\n");
    writeFileSync(path.join(snapshot, "files", "page.html"), "<script>alert(1)</script>");
    writeFileSync(path.join(root, "secret.txt"), SECRET);
    // A directory that shares a prefix with `files`, to catch a startsWith containment check.
    mkdirSync(path.join(snapshot, "files-private"));
    writeFileSync(path.join(snapshot, "files-private", "x.txt"), SECRET);
    // A folder that looks like a snapshot but is an in-progress write from the ingest pipeline.
    mkdirSync(path.join(root, `.tmp-${NAME}-1`));
    writeFileSync(path.join(root, `.tmp-${NAME}-1`, "manifest.json"), SECRET);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.stubEnv("SNAPSHOT_DIR", root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("what it serves", () => {
    it("serves the manifest as JSON", async () => {
      const response = await get(NAME, ["manifest.json"]);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(await response.text()).toBe('{"slug":"acme-router"}');
    });

    it.each([
      [["files", "src", "app.ts"], "export const app = 1;\n"],
      [["files", "src", "deep", "x.ts"], "deep\n"],
      [["files", "src", "my file.ts"], "spaced\n"],
      [["files", "src", "100%.ts"], "percent\n"],
      [["files", ".gitignore"], "dotfile\n"],
      [["files", "manifest.json"], "a file in the repo\n"],
    ])("serves %j as text", async (segments, content) => {
      const response = await get(NAME, segments);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(await response.text()).toBe(content);
    });

    it("never serves HTML as HTML", async () => {
      const response = await get(NAME, ["files", "page.html"]);
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("marks responses immutable, and nosniff", async () => {
      for (const segments of [["manifest.json"], ["files", "src", "app.ts"]]) {
        const response = await get(NAME, segments);
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      }
    });
  });

  describe("what it refuses", () => {
    const refused = async (name: string, segments: string[]) => {
      const response = await get(name, segments);
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: "Not found" });
      expect(text).not.toContain(SECRET);
      expect(response.headers.get("cache-control")).toBe("no-store");
    };

    it.each([
      [["symbols.jsonl"]],
      [["occurrences.jsonl"]],
      [["call_edges.jsonl"]],
      [["files"]],
      [["files", "src"]],
      [["files", "src", "nope.ts"]],
      [["nope.json"]],
      [["manifest.json", "x"]],
      [["MANIFEST.JSON"]],
      [["Files", "src", "app.ts"]],
      [["files-private", "x.txt"]],
      [[]],
    ])("anything but the manifest and real files: %j", async (segments) => {
      await refused(NAME, segments);
    });

    it.each([
      ["parent segments", ["files", "..", "symbols.jsonl"]],
      ["parent segments out of the snapshot", ["files", "..", "..", "secret.txt"]],
      ["parent segment first", ["..", "secret.txt"]],
      ["a dot segment", ["files", ".", "src", "app.ts"]],
      ["an escape and re-entry", ["files", "..", "files", "src", "app.ts"]],
      ["an empty segment", ["files", "", "src", "app.ts"]],
      ["a slash inside a segment", ["files", "../symbols.jsonl"]],
      ["a slash inside a segment, further up", ["files", "../../secret.txt"]],
      ["a backslash inside a segment", ["files", "..\\symbols.jsonl"]],
      ["a backslash path", ["files", "src\\app.ts"]],
      ["a bare backslash segment", ["files", "\\"]],
      ["an encoded slash", ["files", "..%2fsymbols.jsonl"]],
      ["an encoded slash, uppercase", ["files", "..%2Fsymbols.jsonl"]],
      ["an encoded backslash", ["files", "..%5csymbols.jsonl"]],
      ["encoded dots", ["files", "%2e%2e", "symbols.jsonl"]],
      ["half-encoded dots", ["files", ".%2e", "symbols.jsonl"]],
      ["a NUL byte", ["files", "src", "app.ts\0.png"]],
      ["an encoded NUL byte", ["files", "src", "app.ts%00.png"]],
      ["an absolute path", ["files", "/etc/passwd"]],
      ["a Windows drive path", ["files", "C:\\Windows\\win.ini"]],
      ["a drive-relative path", ["files", "C:secret.txt"]],
      ["an NTFS alternate stream", ["files", "src", "app.ts::$DATA"]],
      ["a trailing dot, which Windows strips", ["files", "src", "app.ts."]],
      ["a trailing space, which Windows strips", ["files", "src", "app.ts "]],
      ["dot-dot-space, which Windows reads as ..", ["files", ".. ", "symbols.jsonl"]],
      ["dot-dot-dot, which Windows reads as ..", ["files", "...", "symbols.jsonl"]],
      ["a device name", ["files", "NUL"]],
      ["a device name with an extension", ["files", "CON.txt"]],
    ])("traversal: %s", async (_name, segments) => {
      await refused(NAME, segments);
    });

    it.each([
      ["no SHA", "acme-router"],
      ["an empty SHA", "acme-router@"],
      ["a short SHA", `acme-router@${"a".repeat(39)}`],
      ["a long SHA", `acme-router@${"a".repeat(41)}`],
      ["an uppercase SHA", `acme-router@${"A".repeat(40)}`],
      ["a non-hex SHA", `acme-router@${"g".repeat(40)}`],
      ["no slug", `@${"a".repeat(40)}`],
      ["parent segments", ".."],
      ["parent segments before the SHA", `..@${"a".repeat(40)}`],
      ["a slash", `../${NAME}`],
      ["a backslash", `..\\${NAME}`],
      ["an encoded slash", `..%2f${NAME}`],
      ["a temp folder", `.tmp-${NAME}-1`],
      ["a real name with a suffix", `${NAME}x`],
      ["a trailing newline", `${NAME}\n`],
    ])("a snapshot name with %s", async (_name, name) => {
      await refused(name, ["manifest.json"]);
    });

    it("a snapshot that doesn't exist", async () => {
      await refused(`acme-router@${"b".repeat(40)}`, ["manifest.json"]);
    });

    it("a symlink that points out of the snapshot", async (context) => {
      const link = path.join(root, NAME, "files", "link.txt");
      try {
        symlinkSync(path.join(root, "secret.txt"), link);
      } catch {
        // Creating symlinks needs a privilege on Windows.
        context.skip();
      }
      await refused(NAME, ["files", "link.txt"]);
    });

    it("a directory link that points out of the snapshot", async () => {
      // A junction needs no privilege on Windows. Elsewhere the type is ignored and it's a symlink.
      symlinkSync(root, path.join(root, NAME, "files", "up"), "junction");
      await refused(NAME, ["files", "up", "secret.txt"]);
    });
  });

  describe("where it reads from", () => {
    it("serves nothing in production unless SNAPSHOT_DIR is set", async () => {
      vi.stubEnv("SNAPSHOT_DIR", "");
      vi.stubEnv("NODE_ENV", "production");
      expect((await get(NAME, ["manifest.json"])).status).toBe(404);
    });

    it("serves from SNAPSHOT_DIR in production when it's set", async () => {
      vi.stubEnv("NODE_ENV", "production");
      expect((await get(NAME, ["manifest.json"])).status).toBe(200);
    });

    it("defaults to ../ingest/out relative to web/", async () => {
      vi.stubEnv("SNAPSHOT_DIR", "");
      const web = path.join(root, "checkout", "web");
      const out = path.join(root, "checkout", "ingest", "out", NAME);
      mkdirSync(web, { recursive: true });
      mkdirSync(out, { recursive: true });
      writeFileSync(path.join(out, "manifest.json"), '{"from":"default"}');
      const cwd = vi.spyOn(process, "cwd").mockReturnValue(web);
      try {
        expect(await (await get(NAME, ["manifest.json"])).text()).toBe('{"from":"default"}');
      } finally {
        cwd.mockRestore();
      }
    });
  });
});
