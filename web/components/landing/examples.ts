// Real, published puzzles shown on the landing page. Their prompts are public on the puzzle pages;
// their answers aren't shown here or anywhere else on the landing page. A prompt is quoted word for
// word (code spans without backticks), cut short with "…" where it's long. web/tests/landing.test.ts
// checks each slug, title and prompt against content/puzzles.

export interface LandingExample {
  type: "Find" | "Trace" | "Architecture";
  summary: string;
  slug: string;
  /** The repository as `owner/name` on GitHub. */
  repo: string;
  title: string;
  prompt: string;
  /** What an answer of this type is, in words. */
  answer: string;
  /** The shape of a canonical answer ID, with placeholders, never a real answer. */
  format: string;
}

export const LANDING_EXAMPLES: readonly LandingExample[] = [
  {
    type: "Find",
    summary: "Locate one specific thing.",
    slug: "hono-find-001",
    repo: "honojs/hono",
    title: "The strict-routing switch",
    prompt:
      "In src/utils/url.ts, select the function that drops a trailing slash from the request path, which is what makes /users/ route like /users when an app is created with strict mode off. Select a function.",
    answer: "One function, class or method, one file, or one range of lines.",
    format: "path/to/file.ts#Class.method",
  },
  {
    type: "Trace",
    summary: "Follow calls from a start to an end point.",
    slug: "hono-trace-002",
    repo: "honojs/hono",
    title: "From c.redirect to the response builder",
    prompt:
      "In src/context.ts, start at Context.redirect, called with a location and no status. List the chain of functions, in call order, where each one calls the next, until the private method of Context that combines the prepared headers and the status into a new Response is reached. …",
    answer: "An ordered chain of functions, from the start point to the end point.",
    format: "a.ts#start → b.ts#next → … → c.ts#end",
  },
  {
    type: "Architecture",
    summary: "How the modules divide the work.",
    slug: "rtk-architecture-003",
    repo: "reduxjs/redux-toolkit",
    title: "Classes in the toolkit core",
    prompt:
      "In packages/toolkit/src/ (ignore the query/ folder and tests), exactly 4 classes are declared. Select all 4 classes.",
    answer: "A set of files and symbols, in any order, or one of several listed options.",
    format: "{ a.ts#ClassA, b.ts#ClassB, … }",
  },
];
