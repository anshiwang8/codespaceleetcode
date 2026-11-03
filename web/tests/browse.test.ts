import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PuzzleSummary } from "@/lib/api-types";
import {
  browseHref,
  difficultyTallies,
  filterPuzzles,
  groupPuzzles,
  topicTallies,
} from "@/lib/browse";
import { TOPIC_ORDER, topicDescription, topicLabel } from "@/lib/topics";

function puzzle(slug: string, fields: Partial<PuzzleSummary> = {}): PuzzleSummary {
  return {
    slug,
    type: "find",
    difficulty: "easy",
    title: slug,
    repoSlug: "acme-a",
    language: "typescript",
    tags: [],
    status: "unsolved",
    ...fields,
  };
}

const puzzles = [
  puzzle("a", { tags: ["routing", "errors"], status: "solved" }),
  puzzle("b", { difficulty: "medium", type: "trace", tags: ["routing"], repoSlug: "acme-b" }),
  puzzle("c", { difficulty: "hard", tags: ["errors"], status: "attempted" }),
  puzzle("d", { difficulty: "medium", tags: [], repoSlug: "acme-b", language: "python", status: "solved" }),
  puzzle("e", { difficulty: "hard", type: "trace", tags: ["legacy-tag"] }),
];

const slugs = (list: { slug: string }[]) => list.map((item) => item.slug);

describe("the topic list", () => {
  it("matches the enum in the puzzle schema, in the same order", () => {
    const schema = JSON.parse(
      readFileSync(join(process.cwd(), "..", "content", "schema", "puzzle.schema.json"), "utf8"),
    ) as { properties: { tags: { items: { enum: string[] } } } };
    expect(TOPIC_ORDER).toEqual(schema.properties.tags.items.enum);
  });

  it("labels a tag outside the list as itself", () => {
    expect(topicLabel("routing")).toBe("Routing");
    expect(topicLabel("legacy-tag")).toBe("legacy-tag");
    expect(topicDescription("legacy-tag")).toBeNull();
  });
});

describe("filterPuzzles", () => {
  it("applies every filter together", () => {
    expect(slugs(filterPuzzles(puzzles, {}))).toEqual(["a", "b", "c", "d", "e"]);
    expect(slugs(filterPuzzles(puzzles, { tag: "routing" }))).toEqual(["a", "b"]);
    expect(slugs(filterPuzzles(puzzles, { tag: "routing", type: "trace" }))).toEqual(["b"]);
    expect(slugs(filterPuzzles(puzzles, { repo: "acme-b", difficulty: "medium" }))).toEqual(["b", "d"]);
    expect(slugs(filterPuzzles(puzzles, { difficulty: "hard", repo: "acme-b" }))).toEqual([]);
  });
});

describe("difficultyTallies", () => {
  it("counts under the other filters, ignoring the difficulty filter itself", () => {
    expect(difficultyTallies(puzzles, { difficulty: "easy" })).toEqual({
      easy: { total: 1, solved: 1 },
      medium: { total: 2, solved: 1 },
      hard: { total: 2, solved: 0 },
    });
    expect(difficultyTallies(puzzles, { type: "trace" })).toEqual({
      easy: { total: 0, solved: 0 },
      medium: { total: 1, solved: 0 },
      hard: { total: 1, solved: 0 },
    });
  });
});

describe("topicTallies", () => {
  it("lists listed topics in their fixed order, then other tags, ignoring the topic filter", () => {
    expect(topicTallies(puzzles, { tag: "errors" })).toEqual([
      { tag: "routing", total: 2, solved: 1 },
      { tag: "errors", total: 2, solved: 1 },
      { tag: "legacy-tag", total: 1, solved: 0 },
    ]);
  });

  it("leaves out empty topics but keeps the selected one, so it can be cleared", () => {
    expect(topicTallies(puzzles, { difficulty: "medium", tag: "errors" })).toEqual([
      { tag: "routing", total: 1, solved: 0 },
      { tag: "errors", total: 0, solved: 0 },
    ]);
  });
});

describe("groupPuzzles", () => {
  it("groups by difficulty, easiest first, leaving out empty groups", () => {
    const groups = groupPuzzles(filterPuzzles(puzzles, { type: "trace" }), "difficulty", { type: "trace" });
    expect(groups.map((group) => [group.key, group.label, slugs(group.puzzles)])).toEqual([
      ["medium", "Medium", ["b"]],
      ["hard", "Hard", ["e"]],
    ]);
  });

  it("lists a puzzle under each of its topics, and untagged puzzles last", () => {
    const groups = groupPuzzles(puzzles, "topic", {});
    expect(groups.map((group) => [group.key, slugs(group.puzzles), group.solved])).toEqual([
      ["routing", ["a", "b"], 1],
      ["errors", ["a", "c"], 1],
      ["legacy-tag", ["e"], 0],
      ["no-topic", ["d"], 1],
    ]);
    expect(groups[0]?.description).toBe(topicDescription("routing"));
  });

  it("shows only the selected topic, without repeating its description", () => {
    const filters = { tag: "errors" };
    const groups = groupPuzzles(filterPuzzles(puzzles, filters), "topic", filters);
    expect(groups.map((group) => [group.key, slugs(group.puzzles), group.description])).toEqual([
      ["errors", ["a", "c"], null],
    ]);
  });

  it("groups by repo alphabetically, described by language", () => {
    const groups = groupPuzzles(puzzles, "repo", {});
    expect(groups.map((group) => [group.label, group.description, group.total])).toEqual([
      ["acme-a", "typescript", 3],
      ["acme-b", "typescript", 2],
    ]);
  });

  it("puts everything in one group when not grouping, and nothing when nothing matches", () => {
    expect(groupPuzzles(puzzles, "none", {}).map((group) => group.total)).toEqual([5]);
    expect(groupPuzzles([], "none", {})).toEqual([]);
    expect(groupPuzzles([], "topic", {})).toEqual([]);
  });
});

describe("browseHref", () => {
  it("leaves defaults out, so the plain list stays at /", () => {
    expect(browseHref({ filters: {}, group: "difficulty" })).toBe("/");
    expect(browseHref({ filters: {}, group: "topic" })).toBe("/?group=topic");
    expect(browseHref({ filters: { difficulty: "hard", tag: "auth-and-security" }, group: "repo" })).toBe(
      "/?difficulty=hard&tag=auth-and-security&group=repo",
    );
  });

  it("encodes values", () => {
    expect(browseHref({ filters: { repo: "a&b" }, group: "difficulty" })).toBe("/?repo=a%26b");
  });
});
