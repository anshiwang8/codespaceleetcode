import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_EXAMPLES } from "@/components/landing/examples";
import { MARK_NODES, MARK_PATH, markSvgBody } from "@/components/site/mark";

// The landing page quotes real puzzles and shows one worked example. These checks keep both honest:
// the quoted puzzles exist and are published, the quotes match, and the worked example's answer
// isn't any puzzle's answer.

const CONTENT = path.resolve(import.meta.dirname, "../../content/puzzles");

interface PuzzleFile {
  path: string;
  text: string;
}

function puzzleFiles(): PuzzleFile[] {
  return readdirSync(CONTENT, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => ({ path: file, text: readFileSync(path.join(CONTENT, file), "utf8") }));
}

/** A YAML block scalar or plain value, as one line of words, with code backticks dropped. */
function field(text: string, name: string): string {
  // Windows checkouts have CRLF endings; a blank line must still read as blank.
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`${name}:`));
  if (start === -1) return "";
  const inline = lines[start]?.slice(name.length + 1).trim() ?? "";
  if (inline && inline !== "|" && inline !== ">") return inline;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line !== "" && !line.startsWith(" ")) break;
    body.push(line.trim());
  }
  return body.join(" ").replace(/\s+/g, " ").trim();
}

const plain = (text: string) => text.replaceAll("`", "").replace(/\s+/g, " ").trim();

describe("landing page examples", () => {
  const files = puzzleFiles();

  for (const example of LANDING_EXAMPLES) {
    it(`${example.slug} is a published ${example.type} puzzle, quoted word for word`, () => {
      const file = files.find(({ text }) => new RegExp(`^id: ${example.slug}$`, "m").test(text));
      expect(file, example.slug).toBeDefined();
      const text = file?.text ?? "";
      expect(field(text, "type")).toBe(example.type.toLowerCase());
      expect(field(text, "title")).toBe(example.title);
      // Published means at least one blind second solve (ingest seed.py).
      expect(text).toMatch(/^verified_by: \[\s*\S/m);
      const quoted = example.prompt.replace(/ …$/, "");
      expect(plain(field(text, "prompt")).startsWith(plain(quoted))).toBe(true);
      expect(file?.path.startsWith(example.repo.replace("/", "-"))).toBe(true);
    });
  }

  it("the worked example's answer is no puzzle's answer, and its file is no answer's file", () => {
    for (const { path: file, text } of files) {
      if (!file.startsWith("psf-requests")) continue;
      const answer = text.slice(text.indexOf("\nanswer:"), text.indexOf("\nchoices:") === -1 ? undefined : text.indexOf("\nchoices:"));
      expect(answer, file).not.toContain("CaseInsensitiveDict");
      expect(answer, file).not.toContain("src/requests/structures.py");
    }
  });
});

// The static brand files are written from components/site/mark.ts by scripts/brand-icons.mjs, so
// the favicon, the brand SVGs and the inline logo can't drift apart.
describe("brand files", () => {
  const WEB = path.resolve(import.meta.dirname, "..");
  const svgs = [
    "app/icon.svg",
    "public/brand/mark-light.svg",
    "public/brand/mark-dark.svg",
    "public/brand/logo-light.svg",
    "public/brand/logo-dark.svg",
  ];

  for (const file of svgs) {
    it(`${file} draws the current mark`, () => {
      const text = readFileSync(path.join(WEB, file), "utf8");
      expect(text).toContain(`d="${MARK_PATH}"`);
      for (const { cx, cy } of MARK_NODES) expect(text).toContain(`cx="${cx}" cy="${cy}"`);
      expect(text).toContain("<title>codebases</title>");
    });
  }

  it("the favicon is codebases Light's mark", () => {
    const text = readFileSync(path.join(WEB, "app/icon.svg"), "utf8");
    expect(text).toContain(markSvgBody({ tile: "#2563eb", ink: "#ffffff" }));
  });

  it("the lockups spell the name in lowercase", () => {
    for (const file of ["public/brand/logo-light.svg", "public/brand/logo-dark.svg"]) {
      expect(readFileSync(path.join(WEB, file), "utf8")).toMatch(/>codebases<\/text>/);
    }
  });
});
