import type { Metadata } from "next";
import Link from "next/link";
import { CodeDemo } from "@/components/landing/CodeDemo";
import { LANDING_EXAMPLES } from "@/components/landing/examples";
import styles from "@/components/landing/landing.module.css";
import { LoginButton } from "@/components/landing/LoginButton";
import { ViewportReveals } from "@/components/landing/ViewportReveals";
import { Logo } from "@/components/site/Logo";
import { browseHref, DEFAULT_GROUPING, PUZZLES_PATH } from "@/lib/browse";

export const metadata: Metadata = {
  title: { absolute: "codebases: practice reading real code" },
};

// Plain HTML, no data: the landing page renders without the database.
export const dynamic = "force-static";

const EASY_FIND = browseHref({ filters: { type: "find", difficulty: "easy" }, group: DEFAULT_GROUPING });

const STEPS = [
  {
    title: "Pick a puzzle",
    body: "Filter by difficulty, topic or repository. Each puzzle names its repository and the commit it's pinned to, so the code never changes under you.",
  },
  {
    title: "Read the code",
    body: "The workspace has a file tree, search, go-to-definition and find references, all from a code index of that commit.",
  },
  {
    title: "Select your answer",
    body: "Depending on the question, click a function or class, a file, a range of lines, or one of the listed options. Answers are never typed.",
  },
  {
    title: "Submit and see the result",
    body: "The server checks your answer against the puzzle's one correct answer. Every submission counts as an attempt. A correct answer unlocks a written solution that shows where to look and why.",
  },
] as const;

const LIMITS = [
  "No code runs. Puzzles are about reading, not executing or fixing.",
  "No partial credit. An answer is the exact symbol, file, lines or option, or it's wrong.",
  "No peeking. A solution shows only after you've solved the puzzle.",
  "The workspace needs a laptop-size screen. The puzzle list works on a phone.",
  "Each puzzle's second, blind solve has been done by an automated agent so far, not yet by a person. Every puzzle page says so.",
] as const;

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <Link href="/" className={styles.brand} aria-label="codebases home">
            <Logo size="small" />
          </Link>
          <nav aria-label="Main" className={styles.topNav}>
            <a href="#how">How it works</a>
            <Link href={PUZZLES_PATH}>Puzzles</Link>
          </nav>
        </div>
      </header>

      <main>
        <ViewportReveals />
        <section className={styles.hero} data-testid="hero" aria-labelledby="hero-heading">
          <div className={styles.heroText}>
            <h1 id="hero-heading" className={styles.tagline}>
              Practice reading code you didn&apos;t write.
            </h1>
            <p className={styles.subline}>
              Each puzzle puts you in a real open-source repository, such as requests, Flask, Hono or Zod, pinned to
              one commit. It asks one precise question: where a behavior lives, which calls a request passes through,
              or how the modules divide the work. You find the answer in a browser IDE and click it to submit.
            </p>
            <div className={styles.actions}>
              <Link href={PUZZLES_PATH} className={`${styles.button} ${styles.primary}`} data-testid="browse-puzzles">
                Browse puzzles
              </Link>
              <LoginButton />
            </div>
            <p className={styles.gate}>
              Reading puzzles needs no account. Signing in is free.
            </p>
          </div>
          <CodeDemo />
        </section>

        <section className={styles.section} id="how" data-reveal aria-labelledby="how-heading">
          <h2 id="how-heading" className={styles.h2}>
            How a puzzle works
          </h2>
          <div className={styles.howGrid}>
            <ol className={styles.steps}>
              {STEPS.map((step, index) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className={styles.h3}>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className={styles.limits}>
              <h3 className={styles.h3}>What it doesn&apos;t do</h3>
              <ul>
                {LIMITS.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.tinted}`} id="types" data-reveal aria-labelledby="types-heading">
          <div className={styles.sectionInner}>
            <h2 id="types-heading" className={styles.h2}>
              Three kinds of puzzle
            </h2>
            <p className={styles.lede}>
              Each one below is a real puzzle on the site. Open it to read the full prompt and the code.
            </p>
            <ul className={styles.types}>
              {LANDING_EXAMPLES.map((example) => (
                <li key={example.type} className={styles.typeCard}>
                  <h3 className={styles.typeName}>{example.type}</h3>
                  <p className={styles.typeSummary}>{example.summary}</p>
                  <div className={styles.example}>
                    <p className={styles.exampleRepo}>
                      <span className="mono">{example.repo}</span>
                    </p>
                    <p className={styles.exampleTitle}>
                      <Link href={`/puzzles/${example.slug}`}>{example.title}</Link>
                    </p>
                    <p className={styles.examplePrompt}>{example.prompt}</p>
                  </div>
                  <dl className={styles.answerShape}>
                    <dt>You answer with</dt>
                    <dd>{example.answer}</dd>
                    <dt>Written as</dt>
                    <dd>
                      <code className={styles.answerChip}>{example.format}</code>
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.section} id="why" data-reveal aria-labelledby="why-heading">
          <div className={styles.why}>
            <h2 id="why-heading" className={styles.h2}>
              Why practice this
            </h2>
            <div className={styles.prose}>
              <p>
                Most engineering work happens in code someone else wrote. Before you can change it, you have to find
                where a behavior lives, follow a request through its layers, and see where a new piece would belong.
                It&apos;s a skill, and it improves with practice.
              </p>
              <p>
                Some interviews now test it directly: you get an unfamiliar repository and questions about it. Plenty
                still ask algorithm questions. codebases is practice for the reading part, with questions that have one
                checkable answer, so you know whether you found it.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-heading">
          <h2 id="closing-heading" className={styles.closingHeading}>
            Start with an easy one
          </h2>
          <p className={styles.closingText}>
            Easy Find puzzles name the file or folder to look in, so one search or one jump to a definition gets you to
            the answer.
          </p>
          <Link href={EASY_FIND} className={`${styles.button} ${styles.primary}`} data-testid="try-easy">
            Try an easy Find puzzle
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
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
