import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/landing/landing.module.css";
import { IdePreview } from "@/components/landing/IdePreview";
import { Logo } from "@/components/site/Logo";
import { PUZZLES_PATH } from "@/lib/browse";

export const metadata: Metadata = {
  title: { absolute: "codebases: practice reading real code" },
};

// Plain HTML, no data: the landing page renders without the database.
export const dynamic = "force-static";

const STEPS = [
  {
    title: "Real repos, pinned to a commit",
    body: "Every puzzle is set inside a real open-source repository at a fixed commit, so the code never shifts under you and every answer stays checkable.",
  },
  {
    title: "An IDE in your browser",
    body: "A file tree, search, go-to-definition and find references, backed by a precise code index of the whole repo. Nothing to install.",
  },
  {
    title: "Answer by clicking on code",
    body: "You pick a file, a symbol, or a range of lines straight from the editor. There's nothing to type, so nothing turns on spelling.",
  },
  {
    title: "Graded exactly",
    body: "Your answer is checked on the server against one canonical answer. It's right or it isn't, with no fuzzy matching.",
  },
  {
    title: "A written solution for each",
    body: "Solve a puzzle and its detailed solution unlocks, walking through where to look and why the answer is the answer.",
  },
] as const;

const TYPES = [
  {
    name: "Find",
    summary: "Locate one specific thing.",
    example: "Which method decides whether a request path matches a route?",
    answer: ["src/router.ts#Router.match"],
    answerLabel: "One symbol",
  },
  {
    name: "Trace",
    summary: "Follow a call chain from a start to an end point.",
    example: "Starting at the server's entry point, which functions does a request pass through, in order, before it's matched?",
    answer: ["start", "Router.handle", "Router.match"],
    answerLabel: "An ordered chain",
  },
  {
    name: "Architecture",
    summary: "Module responsibilities, boundaries and extension points.",
    example: "Which module would you change to send logs somewhere new, without touching the router?",
    answer: ["src/logging/"],
    answerLabel: "A module",
  },
] as const;

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <Link href="/" className={styles.brand}>
            <Logo size="small" />
          </Link>
          <nav aria-label="Main" className={styles.topNav}>
            <a href="#how">How it works</a>
            <Link href={PUZZLES_PATH}>Puzzles</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={styles.hero} data-testid="hero">
          <div className={styles.heroText}>
            <Logo size="large" className={styles.heroLogo} />
            <h1 className={styles.tagline}>
              Practice the interview that&apos;s replacing LeetCode: reading real code.
            </h1>
            <p className={styles.subline}>
              Short puzzles set inside real open-source repositories. Find where a behavior lives,
              trace a request through the layers, and explain how the modules fit together, all in a
              browser IDE.
            </p>
            <div className={styles.actions}>
              <Link href={PUZZLES_PATH} className={`${styles.button} ${styles.primary}`}>
                Continue as guest
              </Link>
              <span className={styles.loginWrap}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.secondary}`}
                  aria-disabled="true"
                  aria-describedby="login-soon"
                  title="Coming soon"
                  data-testid="log-in"
                >
                  Log in
                </button>
                <span id="login-soon" className={styles.soon}>
                  Coming soon
                </span>
              </span>
            </div>
          </div>
          <IdePreview />
        </section>

        <section className={styles.section} id="why" aria-labelledby="why-heading">
          <div className={styles.split}>
            <div>
              <p className={styles.eyebrow}>Why this exists</p>
              <h2 id="why-heading" className={styles.h2}>
                The job is reading code. Interviews are catching up.
              </h2>
            </div>
            <div className={styles.prose}>
              <p>
                Most of an engineer&apos;s day isn&apos;t spent writing an algorithm from a blank file.
                It&apos;s spent in a codebase someone else wrote: finding where a behavior lives,
                following a request through its layers, and working out where a change belongs.
              </p>
              <p>
                That&apos;s why companies are moving away from algorithm puzzles toward interviews that
                look like the work. You get an unfamiliar repository and a question about it, and the
                interviewer watches how you find your way.
              </p>
              <p>
                Algorithm puzzles mostly reward memorized patterns. Now that AI assistants can solve the
                well-known ones on request, a correct answer says less than it used to about how someone
                will do on the job.
              </p>
              <p>
                Reading unfamiliar code is a skill, and it gets better with practice. codebases is that
                practice, on real code, with answers that are either right or wrong.
              </p>
            </div>
          </div>

          <div className={styles.compare}>
            <div className={styles.compareCol}>
              <h3 className={styles.compareHead}>An algorithm puzzle</h3>
              <ul className={styles.compareList}>
                <li>A blank file and a problem you may have seen before</li>
                <li>Rewards recalling the right pattern</li>
                <li>A well-known problem is easy to hand to an AI assistant</li>
              </ul>
            </div>
            <div className={`${styles.compareCol} ${styles.compareOurs}`}>
              <h3 className={styles.compareHead}>A codebase puzzle</h3>
              <ul className={styles.compareList}>
                <li>Thousands of lines of code you&apos;ve never seen</li>
                <li>Rewards navigating, tracing and judgment</li>
                <li>Close to what you&apos;ll do in your first week</li>
              </ul>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.tinted}`} id="how" aria-labelledby="how-heading">
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="how-heading" className={styles.h2}>
            A real repo, a real editor, and one right answer.
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className={styles.h3}>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section} id="types" aria-labelledby="types-heading">
          <p className={styles.eyebrow}>Three kinds of puzzle</p>
          <h2 id="types-heading" className={styles.h2}>
            Find it, trace it, explain it.
          </h2>
          <ul className={styles.types}>
            {TYPES.map((type) => (
              <li key={type.name} className={styles.typeCard}>
                <h3 className={styles.typeName}>{type.name}</h3>
                <p className={styles.typeSummary}>{type.summary}</p>
                <p className={styles.example}>
                  <span className={styles.exampleLabel}>For example</span>
                  {type.example}
                </p>
                <p className={styles.answer}>
                  <span className={styles.exampleLabel}>{type.answerLabel}</span>
                  <span className={styles.answerIds}>
                    {type.answer.map((id, index) => (
                      <span key={id} className={styles.answerItem}>
                        {index > 0 ? (
                          <span className={styles.arrow} aria-hidden="true">
                            →
                          </span>
                        ) : null}
                        <code className={styles.answerChip}>{id}</code>
                      </span>
                    ))}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.closing} aria-labelledby="closing-heading">
          <h2 id="closing-heading" className={styles.closingHeading}>
            Open a real codebase and start reading.
          </h2>
          <p className={styles.closingText}>No setup, no install. Pick a puzzle and go.</p>
          <Link href={PUZZLES_PATH} className={`${styles.button} ${styles.primary}`}>
            Continue as guest
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Logo size="small" />
          <p>Puzzles are set in open-source repositories, each under its own license.</p>
          <nav aria-label="Footer" className={styles.footerNav}>
            <Link href={PUZZLES_PATH}>Puzzles</Link>
            <a href="#how">How it works</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
