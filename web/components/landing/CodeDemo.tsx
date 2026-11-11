import styles from "@/components/landing/landing.module.css";
import { Icon } from "@/components/site/Icon";

// A static picture of one question, built from the real requests source at the commit the site
// pins. It isn't one of the site's puzzles: neither CaseInsensitiveDict nor structures.py is any
// puzzle's answer (checked against content/puzzles), so showing its answer gives nothing away.
// Keep it that way if puzzles are added for requests.

const REPO = "psf/requests";
const SHA = "3c7baaa05ab4aa49cc819ce3a819d260de19c157";
const FILE = "src/requests/structures.py";
const SOURCE_URL = `https://github.com/${REPO}/blob/${SHA}/${FILE}#L20-L65`;

type Token = readonly [kind: "kw" | "fn" | "ty" | "str" | "cm" | "plain", text: string];
const t = (kind: Token[0], text: string): Token => [kind, text];
const p = (text: string): Token => ["plain", text];

/** Lines copied verbatim from the file at that commit. A null number marks lines left out. */
const LINES: readonly { n: number | null; tokens: readonly Token[]; picked?: boolean }[] = [
  {
    n: 20,
    picked: true,
    tokens: [t("kw", "class"), p(" "), t("ty", "CaseInsensitiveDict"), p("(MutableMapping[str, _VT], Generic[_VT]):")],
  },
  { n: 21, tokens: [p("    "), t("str", '"""A case-insensitive ``dict``-like object.')] },
  { n: null, tokens: [] },
  { n: 59, tokens: [p("    "), t("kw", "def"), p(" "), t("fn", "__setitem__"), p("(self, key: str, value: _VT) -> "), t("kw", "None"), p(":")] },
  { n: 60, tokens: [p("        "), t("cm", "# Use the lowercased key for lookups, but store the actual")] },
  { n: 61, tokens: [p("        "), t("cm", "# key alongside the value.")] },
  { n: 62, tokens: [p("        self._store[key.lower()] = (key, value)")] },
  { n: 63, tokens: [] },
  { n: 64, tokens: [p("    "), t("kw", "def"), p(" "), t("fn", "__getitem__"), p("(self, key: str) -> _VT:")] },
  { n: 65, tokens: [p("        "), t("kw", "return"), p(" self._store[key.lower()][1]")] },
];

const TOKEN_CLASS: Record<Token[0], string | undefined> = {
  kw: styles.tokKeyword,
  fn: styles.tokFunction,
  ty: styles.tokType,
  str: styles.tokString,
  cm: styles.tokComment,
  plain: undefined,
};

/**
 * What a puzzle looks like, step by step, next to the code it's about. Nothing in it is a
 * control: it's a figure with a caption, and the one link goes to the real file on GitHub.
 */
export function CodeDemo() {
  return (
    <figure className={styles.demo} aria-labelledby="demo-caption" data-testid="code-demo">
      <div className={styles.demoQuestion}>
        <p className={styles.demoStep}>
          <span className={styles.stepMark} aria-hidden="true">
            1
          </span>
          The question
        </p>
        <p className={styles.demoPrompt}>
          In requests, which class stores <code>response.headers</code>, so that looking up{" "}
          <code>&quot;content-type&quot;</code> finds a header sent as <code>Content-Type</code>? Select a class.
        </p>
      </div>

      <div className={styles.demoCode}>
        <p className={styles.demoStep}>
          <span className={styles.stepMark} aria-hidden="true">
            2
          </span>
          Read the code
        </p>
        <p className={styles.demoNote}>
          Search for <code>response.headers =</code>, which lands in <code>adapters.py</code> line 382, then go to the
          definition of the class it builds.
        </p>
        <div className={styles.window}>
          <p className={styles.windowBar}>
            <span className="mono">{REPO}</span>
            <span className={styles.windowSha} title={SHA}>
              @ {SHA.slice(0, 7)}
            </span>
            <span className={styles.windowPath}>{FILE}</span>
          </p>
          <pre className={styles.code}>
            {LINES.map((line, index) =>
              line.n === null ? (
                <span key={`gap-${index}`} className={styles.codeLine}>
                  <span className={styles.lineNumber}>⋮</span>
                  <span className={styles.lineText} />
                </span>
              ) : (
                <span key={line.n} className={`${styles.codeLine} ${line.picked ? styles.codePicked : ""}`}>
                  <span className={styles.lineNumber}>{line.n}</span>
                  <span className={styles.lineText}>
                    {line.tokens.map(([kind, text], tokenIndex) => (
                      <span key={tokenIndex} className={TOKEN_CLASS[kind]}>
                        {text}
                      </span>
                    ))}
                  </span>
                </span>
              ),
            )}
          </pre>
        </div>
      </div>

      <div className={styles.demoAnswer}>
        <p className={styles.demoStep}>
          <span className={styles.stepMark} aria-hidden="true">
            3
          </span>
          Select and submit
        </p>
        <p className={styles.demoNote}>
          Put the cursor on the class name and choose <strong>Select as answer</strong>. Nothing is typed. The server
          checks it against the puzzle&apos;s one answer, and every submission counts as an attempt.
        </p>
        <p className={styles.demoLabel}>Your answer</p>
        <code className={styles.answerChip}>{FILE}#CaseInsensitiveDict</code>
        <p className={styles.demoResult}>
          <Icon name="check" /> Correct, attempt 1
        </p>
        <p className={styles.demoNote}>The written solution unlocks after a correct answer.</p>
      </div>

      <figcaption id="demo-caption" className={styles.demoCaption}>
        An example written for this page, not one of the puzzles, using the real requests source at commit{" "}
        <a href={SOURCE_URL} rel="noopener noreferrer">
          <span className="mono">{SHA.slice(0, 7)}</span>
          <span className="visually-hidden"> (view this file on GitHub)</span>
        </a>
        .
      </figcaption>
    </figure>
  );
}
