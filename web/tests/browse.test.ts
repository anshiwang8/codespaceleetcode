import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PuzzleSummary } from "@/lib/api-types";
import {
  browseHref,
  difficultyTallies,
  filterPuzzles,
  groupPuzzles,
  nextSort,
  parseSort,
  sortPuzzles,
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

describe("sortPuzzles", () => {
  const table = [
    puzzle("1", { title: "beta", type: "trace", difficulty: "hard", repoSlug: "zeta", status: "solved", tags: ["routing"] }),
    puzzle("2", { title: "Alpha", type: "find", difficulty: "easy", repoSlug: "eta", status: "unsolved", tags: ["errors", "routing"] }),
    puzzle("3", { title: "gamma", type: "architecture", difficulty: "medium", repoSlug: "eta", status: "attempted", tags: ["errors"] }),
    puzzle("4", { title: "Puzzle 10", difficulty: "easy", repoSlug: "alpha", tags: [] }),
    puzzle("5", { title: "Puzzle 9", difficulty: "hard", repoSlug: "alpha", tags: ["legacy-tag"] }),
  ];
  const order = (column: Parameters<typeof nextSort>[1], descending = false) =>
    slugs(sortPuzzles(table, { column, descending }));

  it("keeps the default order with no sort", () => {
    expect(slugs(sortPuzzles(table, undefined))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("sorts text columns A to Z, ignoring case and reading numbers as numbers", () => {
    expect(order("title")).toEqual(["2", "1", "3", "5", "4"]);
    expect(order("type")).toEqual(["3", "2", "4", "5", "1"]);
    expect(order("repo")).toEqual(["4", "5", "2", "3", "1"]);
    // By label: Attempted, Not started, Solved.
    expect(order("status")).toEqual(["3", "2", "4", "5", "1"]);
  });

  it("sorts topics by their labels in row order, with untagged rows first", () => {
    // "", "Errors", "Errors|Routing", "legacy-tag", "Routing".
    expect(order("tags")).toEqual(["4", "3", "2", "5", "1"]);
  });

  it("sorts difficulty from easiest to hardest, not alphabetically", () => {
    expect(order("difficulty")).toEqual(["2", "4", "3", "1", "5"]);
  });

  it("reverses when descending, and ties keep their default order", () => {
    expect(order("difficulty", true)).toEqual(["1", "5", "3", "2", "4"]);
    expect(order("repo", true)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("doesn't change the list it was given", () => {
    sortPuzzles(table, { column: "title", descending: false });
    expect(slugs(table)).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("nextSort and parseSort", () => {
  it("sorts a new column ascending and flips the sorted one", () => {
    expect(nextSort(undefined, "title")).toEqual({ column: "title", descending: false });
    expect(nextSort({ column: "title", descending: false }, "title")).toEqual({ column: "title", descending: true });
    expect(nextSort({ column: "title", descending: true }, "title")).toEqual({ column: "title", descending: false });
    expect(nextSort({ column: "title", descending: true }, "repo")).toEqual({ column: "repo", descending: false });
  });

  it("reads the URL value, ignoring anything it doesn't know", () => {
    expect(parseSort("difficulty")).toEqual({ column: "difficulty", descending: false });
    expect(parseSort("-repo")).toEqual({ column: "repo", descending: true });
    expect(parseSort("--repo")).toBeUndefined();
    expect(parseSort("bogus")).toBeUndefined();
    expect(parseSort(["title", "repo"])).toBeUndefined();
    expect(parseSort(undefined)).toBeUndefined();
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

  it("shows only the selected topic", () => {
    const filters = { tag: "errors" };
    const groups = groupPuzzles(filterPuzzles(puzzles, filters), "topic", filters);
    expect(groups.map((group) => [group.key, slugs(group.puzzles)])).toEqual([["errors", ["a", "c"]]]);
  });

  it("keeps the order it's given inside each group", () => {
    const sorted = sortPuzzles(puzzles, { column: "title", descending: true });
    expect(groupPuzzles(sorted, "topic", {}).map((group) => slugs(group.puzzles))).toEqual([
      ["b", "a"],
      ["c", "a"],
      ["e"],
      ["d"],
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
  it("leaves defaults out, so the plain list stays at /puzzles", () => {
    expect(browseHref({ filters: {}, group: "difficulty" })).toBe("/puzzles");
    expect(browseHref({ filters: {}, group: "topic" })).toBe("/puzzles?group=topic");
    expect(browseHref({ filters: { difficulty: "hard", tag: "auth-and-security" }, group: "repo" })).toBe(
      "/puzzles?difficulty=hard&tag=auth-and-security&group=repo",
    );
  });

  it("keeps the sort, with a minus sign for descending", () => {
    expect(browseHref({ filters: {}, group: "difficulty", sort: { column: "title", descending: false } })).toBe(
      "/puzzles?sort=title",
    );
    expect(browseHref({ filters: { tag: "errors" }, group: "topic", sort: { column: "repo", descending: true } })).toBe(
      "/puzzles?tag=errors&group=topic&sort=-repo",
    );
  });

  it("encodes values", () => {
    expect(browseHref({ filters: { repo: "a&b" }, group: "difficulty" })).toBe("/puzzles?repo=a%26b");
  });
});
