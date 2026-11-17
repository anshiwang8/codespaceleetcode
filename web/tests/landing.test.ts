import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_EXAMPLES } from "@/components/landing/examples";
import {
  MASCOT_COLORS,
  MASCOT_FORMS,
  MASCOT_PAINT_VARIABLES,
  WORDMARK,
  mascotSvgBody,
} from "@/components/site/mascot-geometry";

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

// The static brand files are written from components/site/mascot-geometry.ts by scripts/brand-icons.mjs, so
// the favicon, the brand SVGs, the social preview and the inline logo can't drift apart.
describe("brand files", () => {
  const WEB = path.resolve(import.meta.dirname, "..");
  const read = (file: string) => readFileSync(path.join(WEB, file), "utf8");
  const svgs = [
    "app/icon.svg",
    "public/brand/mark-light.svg",
    "public/brand/mark-dark.svg",
    "public/brand/logo-light.svg",
    "public/brand/logo-dark.svg",
  ];
  const head = MASCOT_FORMS.head;
  const details = head.shapes.filter((shape) => shape.detail);
  const essentials = head.shapes.filter((shape) => !shape.detail);

  it("the mascot has a head and a full form, each on a square grid with details to drop", () => {
    expect(Object.keys(MASCOT_FORMS).sort()).toEqual(["full", "head"]);
    for (const form of Object.values(MASCOT_FORMS)) {
      expect(form.box).toHaveLength(3);
      expect(form.iconBox).toHaveLength(3);
      expect(form.shapes.length).toBeGreaterThan(10);
      for (const shape of form.shapes) expect(shape.d, shape.d).toMatch(/^M[-\d. ,MLCAZ]+$/);
    }
    expect(details.length).toBeGreaterThan(0);
    expect(essentials.length).toBeGreaterThan(details.length);
  });

  it("every mascot color is a hex value with a --mascot custom property", () => {
    for (const [paint, hex] of Object.entries(MASCOT_COLORS)) {
      expect(hex, paint).toMatch(/^#[0-9a-f]{6}$/);
      expect(MASCOT_PAINT_VARIABLES[paint as keyof typeof MASCOT_COLORS], paint).toMatch(/^var\(--mascot-[a-z-]+/);
    }
  });

  for (const file of svgs) {
    it(`${file} draws the current head`, () => {
      const text = read(file);
      for (const shape of essentials) expect(text).toContain(`d="${shape.d}"`);
      expect(text).toContain("<title>codebases</title>");
      expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
    });
  }

  it("the favicon is the head alone, simplified: no spark lines, blush or highlights", () => {
    const text = read("app/icon.svg");
    expect(text).toContain(mascotSvgBody("head", { simple: true }));
    for (const shape of details) expect(text).not.toContain(`d="${shape.d}"`);
    expect(text).not.toContain(WORDMARK.d);
    const [x, y, size] = head.iconBox;
    expect(text).toContain(`viewBox="${x} ${y} ${size} ${size}"`);
  });

  it("the marks keep the details, and only the dark one has the light edge", () => {
    expect(read("public/brand/mark-light.svg")).toContain(mascotSvgBody("head"));
    expect(read("public/brand/mark-light.svg")).not.toContain(MASCOT_COLORS.edge);
    expect(read("public/brand/mark-dark.svg")).toContain(mascotSvgBody("head", { edge: MASCOT_COLORS.edge }));
  });

  it("the lockups draw the name as paths, never as text in a font", () => {
    for (const file of ["public/brand/logo-light.svg", "public/brand/logo-dark.svg"]) {
      const text = read(file);
      expect(text).toContain(`d="${WORDMARK.d}"`);
      expect(text).not.toContain("<text");
      expect(text).not.toContain("font-family");
    }
  });

  it("the inline logo draws the word as paths in the theme's text color", () => {
    const logo = read("components/site/Logo.tsx");
    expect(logo).toContain("WORDMARK.d");
    expect(logo).toContain('fill="currentColor"');
    expect(logo).not.toMatch(/#[0-9a-f]{6}\b/i);
    // Still named for assistive technology, and still one logo.
    expect(logo).toContain("codebases");
    expect(logo).toContain('data-testid="logo"');
  });

  it("the mascot component is decorative and colored by the mascot tokens", () => {
    const mascot = read("components/site/Mascot.tsx");
    expect(mascot).toContain('aria-hidden="true"');
    expect(mascot).toContain('focusable="false"');
    expect(mascot).toContain("MASCOT_PAINT_VARIABLES");
    expect(mascot).toContain("var(--mascot-edge)");
    expect(mascot).not.toMatch(/#[0-9a-f]{6}\b/i);
  });

  it("the logo never animates in a loop, and the old mark is gone", () => {
    expect(read("components/site/logo.module.css")).not.toMatch(/infinite|animation/);
    expect(readdirSync(path.join(WEB, "components/site"))).not.toContain("mark.ts");
    expect(read("app/opengraph-image.tsx")).toContain("@/components/site/mascot-geometry");
  });
});
