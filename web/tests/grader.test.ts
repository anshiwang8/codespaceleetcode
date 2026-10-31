import { describe, expect, it } from "vitest";
import type { Submission } from "@/lib/api-types";
import { answerKeySchema, grade, parseLocationId, type AnswerKey } from "@/lib/server/grader";

const symbolKey: AnswerKey = { kind: "symbol", id: "src/a.ts#Router.handle", accept: ["src/b.ts#handle"] };
const fileKey: AnswerKey = { kind: "file", path: "src/config.ts", accept: ["src/config.js"] };
const locationKey: AnswerKey = { kind: "location", path: "src/config.ts", anchor: [120, 121], window: [118, 135] };
const sequenceKey: AnswerKey = {
  kind: "sequence",
  ids: ["a.ts#one", "a.ts#two", "a.ts#three"],
  accept_sequences: [["a.ts#one", "a.ts#alias", "a.ts#three"]],
};
const setKey: AnswerKey = { kind: "set", ids: ["src/a.ts", "src/b.ts", "src/c.ts"] };
const choiceKey: AnswerKey = { kind: "choice", option: "b" };

describe("symbol", () => {
  const symbol = (id: string): Submission => ({ kind: "symbol", id });

  it("accepts the ID and anything listed in accept", () => {
    expect(grade(symbolKey, symbol("src/a.ts#Router.handle"))).toBe(true);
    expect(grade(symbolKey, symbol("src/b.ts#handle"))).toBe(true);
  });

  it.each([
    ["another symbol", "src/a.ts#Router.other"],
    ["the same name in the wrong file", "src/z.ts#Router.handle"],
    ["different case", "src/a.ts#router.handle"],
    ["a collision suffix", "src/a.ts#Router.handle~2"],
    ["surrounding space", " src/a.ts#Router.handle "],
    ["a partial match", "src/a.ts#Router"],
  ])("rejects %s", (_name, id) => {
    expect(grade(symbolKey, symbol(id))).toBe(false);
  });
});

describe("file", () => {
  const file = (path: string): Submission => ({ kind: "file", path });

  it("accepts the path and anything listed in accept", () => {
    expect(grade(fileKey, file("src/config.ts"))).toBe(true);
    expect(grade(fileKey, file("src/config.js"))).toBe(true);
  });

  it.each([
    ["the wrong file", "src/other.ts"],
    ["different case", "src/Config.ts"],
    ["a leading ./", "./src/config.ts"],
    ["a backslash", "src\\config.ts"],
    ["the bare file name", "config.ts"],
  ])("rejects %s", (_name, path) => {
    expect(grade(fileKey, file(path))).toBe(false);
  });
});

describe("location", () => {
  const location = (id: string): Submission => ({ kind: "location", id });

  it.each([
    ["exactly the anchor", "src/config.ts:L120-L121"],
    ["exactly the window", "src/config.ts:L118-L135"],
    ["the anchor with some context", "src/config.ts:L119-L125"],
  ])("accepts %s", (_name, id) => {
    expect(grade(locationKey, location(id))).toBe(true);
  });

  it.each([
    ["the wrong file", "src/other.ts:L120-L121"],
    ["a file differing in case", "src/Config.ts:L120-L121"],
    ["a path with a leading space", " src/config.ts:L120-L121"],
    ["a path with a leading ./", "./src/config.ts:L120-L121"],
    ["anchor's first line not covered", "src/config.ts:L121-L125"],
    ["anchor's last line not covered", "src/config.ts:L119-L120"],
    ["no overlap with the anchor", "src/config.ts:L125-L130"],
    ["starting before the window", "src/config.ts:L117-L125"],
    ["ending after the window", "src/config.ts:L119-L136"],
    ["the whole file", "src/config.ts:L1-L500"],
  ])("rejects %s", (_name, id) => {
    expect(grade(locationKey, location(id))).toBe(false);
  });

  it.each([
    "src/config.ts",
    "src/config.ts:120-121",
    "src/config.ts:L120",
    "src/config.ts:L120-121",
    "src/config.ts:l120-l121",
    "src/config.ts:L120-L121 ",
    "src/config.ts:L0120-L0121",
    "src/config.ts:L121-L120",
    "src/config.ts:L-120-L121",
    "src/config.ts:L120.5-L121",
    "src/config.ts:L120-L121:L120-L121x",
    ":L120-L121",
    "src/config.ts:L120-L99999999999999999999",
    "src/config.ts:L120-L121\n",
  ])("rejects the malformed ID %j", (id) => {
    expect(parseLocationId(id)).toBeNull();
    expect(grade(locationKey, location(id))).toBe(false);
  });
});

describe("parseLocationId", () => {
  it("parses a span", () => {
    expect(parseLocationId("src/a.ts:L1-L2")).toEqual({ path: "src/a.ts", start: 1, end: 2 });
  });

  it("allows a single line", () => {
    expect(parseLocationId("src/a.ts:L5-L5")).toEqual({ path: "src/a.ts", start: 5, end: 5 });
  });

  it("reads the span from the end, since a path can contain a colon", () => {
    expect(parseLocationId("src/a:b.ts:L1-L2")).toEqual({ path: "src/a:b.ts", start: 1, end: 2 });
  });
});

describe("sequence", () => {
  const sequence = (ids: string[]): Submission => ({ kind: "sequence", ids });

  it("accepts the exact order and any accepted sequence", () => {
    expect(grade(sequenceKey, sequence(["a.ts#one", "a.ts#two", "a.ts#three"]))).toBe(true);
    expect(grade(sequenceKey, sequence(["a.ts#one", "a.ts#alias", "a.ts#three"]))).toBe(true);
  });

  it.each([
    ["the wrong order", ["a.ts#two", "a.ts#one", "a.ts#three"]],
    ["a missing step", ["a.ts#one", "a.ts#three"]],
    ["an extra step", ["a.ts#one", "a.ts#two", "a.ts#three", "a.ts#four"]],
    ["a repeated step", ["a.ts#one", "a.ts#one", "a.ts#two", "a.ts#three"]],
    ["a mix of two accepted sequences", ["a.ts#one", "a.ts#alias", "a.ts#two"]],
    ["different case", ["a.ts#One", "a.ts#two", "a.ts#three"]],
    ["nothing", []],
  ])("rejects %s", (_name, ids) => {
    expect(grade(sequenceKey, sequence(ids))).toBe(false);
  });
});

describe("set", () => {
  const set = (ids: string[]): Submission => ({ kind: "set", ids });

  it("accepts the members in any order", () => {
    expect(grade(setKey, set(["src/a.ts", "src/b.ts", "src/c.ts"]))).toBe(true);
    expect(grade(setKey, set(["src/c.ts", "src/a.ts", "src/b.ts"]))).toBe(true);
  });

  it.each([
    ["a missing member", ["src/a.ts", "src/b.ts"]],
    ["an extra member", ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]],
    ["a wrong member", ["src/a.ts", "src/b.ts", "src/d.ts"]],
    ["a duplicate standing in for a member", ["src/a.ts", "src/a.ts", "src/b.ts"]],
    ["a duplicate on top of the full set", ["src/a.ts", "src/b.ts", "src/c.ts", "src/a.ts"]],
    ["different case", ["src/A.ts", "src/b.ts", "src/c.ts"]],
    ["nothing", []],
  ])("rejects %s", (_name, ids) => {
    expect(grade(setKey, set(ids))).toBe(false);
  });
});

describe("choice", () => {
  const choice = (option: string): Submission => ({ kind: "choice", option });

  it("accepts the option", () => {
    expect(grade(choiceKey, choice("b"))).toBe(true);
  });

  it.each(["a", "B", " b", "b "])("rejects %j", (option) => {
    expect(grade(choiceKey, choice(option))).toBe(false);
  });
});

describe("kind mismatch", () => {
  it("is incorrect even when the value matches the key", () => {
    expect(grade(symbolKey, { kind: "file", path: "src/a.ts#Router.handle" })).toBe(false);
    expect(grade(fileKey, { kind: "symbol", id: "src/config.ts" })).toBe(false);
    expect(grade(sequenceKey, { kind: "set", ids: ["a.ts#one", "a.ts#two", "a.ts#three"] })).toBe(false);
    expect(grade(setKey, { kind: "sequence", ids: ["src/a.ts", "src/b.ts", "src/c.ts"] })).toBe(false);
    expect(grade(locationKey, { kind: "file", path: "src/config.ts:L120-L121" })).toBe(false);
    expect(grade(choiceKey, { kind: "symbol", id: "b" })).toBe(false);
  });
});

describe("answerKeySchema", () => {
  it("reads the key shapes in spec section 4", () => {
    expect(answerKeySchema.parse({ kind: "symbol", id: "a#b", accept: [], accept_reasons: [] })).toEqual({
      kind: "symbol",
      id: "a#b",
      accept: [],
    });
    expect(answerKeySchema.parse({ kind: "file", path: "src/config.ts" })).toEqual({
      kind: "file",
      path: "src/config.ts",
      accept: [],
    });
    expect(answerKeySchema.parse({ kind: "location", path: "a", anchor: [1, 2], window: [1, 3] }).kind).toBe("location");
    expect(answerKeySchema.parse({ kind: "sequence", ids: ["a#b"] })).toEqual({
      kind: "sequence",
      ids: ["a#b"],
      accept_sequences: [],
    });
  });

  it.each([
    [{ kind: "symbol" }],
    [{ kind: "nope", id: "x" }],
    [{ kind: "location", path: "a", anchor: [2, 1], window: [1, 3] }],
    [{ kind: "location", path: "a", anchor: [1], window: [1, 3] }],
    [{ kind: "location", path: "a", anchor: [0, 1], window: [0, 3] }],
    [{ kind: "set", ids: [] }],
    [{ kind: "sequence", ids: [] }],
  ])("refuses the malformed key %j", (key) => {
    expect(answerKeySchema.safeParse(key).success).toBe(false);
  });
});
