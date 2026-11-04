import styles from "@/components/landing/landing.module.css";

type Token = readonly [kind: "kw" | "fn" | "ty" | "str" | "plain", text: string];

const t = (kind: Token[0], text: string): Token => [kind, text];
const p = (text: string): Token => ["plain", text];

// A made-up file, drawn in HTML. It's a picture of the workspace, not a real puzzle.
const LINES: readonly (readonly Token[])[] = [
  [t("kw", "import"), p(" { normalize } "), t("kw", "from"), p(" "), t("str", '"./paths"'), p(";")],
  [],
  [t("kw", "export class"), p(" "), t("ty", "Router"), p(" {")],
  [p("  "), t("fn", "handle"), p("(path: "), t("ty", "string"), p(") {")],
  [p("    "), t("kw", "if"), p(" ("), t("kw", "this"), p(".match(path)) "), t("kw", "return"), p(" "), t("kw", "this"), p(".dispatch(path);")],
  [p("    "), t("kw", "return"), p(" notFound(path);")],
  [p("  }")],
  [],
  [p("  "), t("fn", "match"), p("(path: "), t("ty", "string"), p("): "), t("ty", "boolean"), p(" {")],
  [p("    "), t("kw", "const"), p(" trimmed = normalize(path);")],
  [p("    "), t("kw", "return"), p(" "), t("kw", "this"), p(".routes.has(trimmed);")],
  [p("  }")],
  [p("}")],
];

const SELECTED = { from: 9, to: 12 };

const TREE = [
  { name: "src", depth: 0, folder: true },
  { name: "logging", depth: 1, folder: true },
  { name: "config.ts", depth: 1 },
  { name: "index.ts", depth: 1 },
  { name: "router.ts", depth: 1, active: true },
  { name: "views.ts", depth: 1 },
  { name: "README.md", depth: 0 },
] as const;

const TOKEN_CLASS: Record<Token[0], string | undefined> = {
  kw: styles.tokKeyword,
  fn: styles.tokFunction,
  ty: styles.tokType,
  str: styles.tokString,
  plain: undefined,
};

export function IdePreview() {
  return (
    <figure
      className={styles.preview}
      aria-label="A picture of the puzzle workspace: a file tree, the code, and the answer picked from it"
    >
      <div className={styles.window} aria-hidden="true">
        <div className={styles.windowBar}>
          <span className={styles.dots}>
            <span />
            <span />
            <span />
          </span>
          <span className={styles.windowPath}>src/router.ts</span>
        </div>
        <div className={styles.windowBody}>
          <div className={styles.tree}>
            {TREE.map((item) => (
              <div
                key={item.name}
                className={`${styles.treeItem} ${"active" in item ? styles.treeActive : ""}`}
                style={{ paddingLeft: 10 + item.depth * 12 }}
              >
                <span className={styles.treeIcon}>{"folder" in item ? "▾" : ""}</span>
                {item.name}
              </div>
            ))}
          </div>

          <div className={styles.code}>
            {LINES.map((tokens, index) => {
              const line = index + 1;
              const selected = line >= SELECTED.from && line <= SELECTED.to;
              return (
                <div key={line} className={`${styles.codeLine} ${selected ? styles.codeSelected : ""}`}>
                  <span className={styles.lineNumber}>{line}</span>
                  <span className={styles.lineText}>
                    {tokens.map(([kind, text], tokenIndex) => (
                      <span key={tokenIndex} className={TOKEN_CLASS[kind]}>
                        {text}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>

          <div className={styles.tray}>
            <span className={styles.trayBadge}>Find</span>
            <p className={styles.trayPrompt}>Which method decides whether a request path matches a route?</p>
            <p className={styles.trayLabel}>Your answer</p>
            <code className={styles.answerChip}>src/router.ts#Router.match</code>
            <span className={styles.traySubmit}>Submit</span>
            <p className={styles.trayResult}>✓ Correct</p>
          </div>
        </div>
      </div>
    </figure>
  );
}
