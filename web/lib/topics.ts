/**
 * The fixed list of puzzle topics, in the order the site shows them. Puzzle files store these slugs
 * in `tags`, and content/schema/puzzle.schema.json rejects any other. web/tests/browse.test.ts keeps
 * the two lists equal.
 */
export const TOPICS = {
  routing: {
    label: "Routing",
    description: "Matching a request to the code that handles it.",
  },
  middleware: {
    label: "Middleware and hooks",
    description: "Code that runs before or after a handler: middleware, hooks, guards and interceptors.",
  },
  "request-lifecycle": {
    label: "Request lifecycle",
    description: "The path a request takes from arrival to the response sent back.",
  },
  errors: {
    label: "Errors",
    description: "How errors are raised, classified and turned into responses.",
  },
  "http-clients": {
    label: "HTTP clients",
    description: "Sending requests: redirects, adapters, transports, proxies and request bodies.",
  },
  "retries-and-timeouts": {
    label: "Retries and timeouts",
    description: "Deciding when to try again, how long to wait, and when to give up.",
  },
  reactivity: {
    label: "Reactivity",
    description: "Tracking what state code reads, and running it again when that state changes.",
  },
  compilers: {
    label: "Compilers and code generation",
    description: "Turning templates and schemas into code or into another format.",
  },
  validation: {
    label: "Validation and parsing",
    description: "Checking input against a schema or type, and converting it.",
  },
  "dependency-injection": {
    label: "Dependency injection",
    description: "How modules and providers are registered, resolved and wired together.",
  },
  "extension-points": {
    label: "Extension points",
    description: "Where a library lets you plug in your own code.",
  },
  configuration: {
    label: "Configuration and defaults",
    description: "How options are merged, defaulted and looked up.",
  },
  "state-management": {
    label: "State management",
    description: "Stores, reducers, actions and thunks.",
  },
  observables: {
    label: "Observables",
    description: "Streams of values, the operators that transform them, and subscriptions.",
  },
  "auth-and-security": {
    label: "Auth and security",
    description: "Sessions, credentials, and defences against unsafe requests.",
  },
  "code-structure": {
    label: "Code structure",
    description: "How a codebase is split into modules, layers and class hierarchies.",
  },
  "command-line": {
    label: "Command-line apps",
    description: "Parsing arguments and options, and running commands.",
  },
} as const satisfies Record<string, { label: string; description: string }>;

export type Topic = keyof typeof TOPICS;

export const TOPIC_ORDER = Object.keys(TOPICS) as Topic[];

export function isTopic(value: string): value is Topic {
  return Object.hasOwn(TOPICS, value);
}

/** A tag outside the list, such as one seeded straight into a test database, shows as itself. */
export function topicLabel(tag: string): string {
  return isTopic(tag) ? TOPICS[tag].label : tag;
}

export function topicDescription(tag: string): string | null {
  return isTopic(tag) ? TOPICS[tag].description : null;
}
