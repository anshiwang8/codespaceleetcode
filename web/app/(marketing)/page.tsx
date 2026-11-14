import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CodeDemo } from "@/components/landing/CodeDemo";
import { LANDING_EXAMPLES } from "@/components/landing/examples";
import styles from "@/components/landing/landing.module.css";
import { LoginButton } from "@/components/landing/LoginButton";
import { ReturningMark } from "@/components/landing/ReturningMark";
import { ViewportReveals } from "@/components/landing/ViewportReveals";
import { Logo } from "@/components/site/Logo";
import { SiteFooter } from "@/components/site/SiteFooter";
import { browseHref, DEFAULT_GROUPING, PUZZLES_PATH } from "@/lib/browse";
import workspaceDark from "@/public/landing/workspace-dark.png";
import workspaceLight from "@/public/landing/workspace-light.png";

export const metadata: Metadata = {
  title: { absolute: "codebases: practice reading real code" },
};

// Plain HTML, no data: the landing page renders without the database.
export const dynamic = "force-static";

const EASY_FIND = browseHref({ filters: { type: "find", difficulty: "easy" }, group: DEFAULT_GROUPING });

const LIMITS = [
  "No code runs. Puzzles are about reading, not executing or fixing.",
  "No partial credit. An answer is the exact symbol, file, lines or option, or it's wrong.",
  "No peeking. A solution shows only after you've solved the puzzle.",
  "The workspace needs a laptop-size screen. The puzzle list works on a phone.",
  "Each puzzle's second, blind solve has been done by an automated agent so far, not yet by a person.",
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
            <Link href="/learn">Learn</Link>
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
              how the modules divide the work, or how the code meets a system-design requirement. You find the answer
              in a browser IDE and click it to submit.
            </p>
            {/* Both sets render; CSS shows the second only on a browser someone has signed in on. */}
            <ReturningMark />
            <div className={`${styles.actions} ${styles.newVisitor}`}>
              <Link href={PUZZLES_PATH} className={`${styles.button} ${styles.primary}`} data-testid="browse-puzzles">
                Browse puzzles
              </Link>
              <LoginButton />
            </div>
            <p id="hero-gate" className={`${styles.gate} ${styles.newVisitor}`}>
              Reading puzzles needs no account. Sign in, free, to submit answers and save your progress.
            </p>
            <div className={`${styles.actions} ${styles.returning}`}>
              <Link href={PUZZLES_PATH} className={`${styles.button} ${styles.primary}`} data-testid="to-puzzles">
                To puzzles
              </Link>
            </div>
          </div>
          <figure className={styles.shot} data-testid="workspace-shot">
            <div className={styles.shotFrame}>
              {/* The real workspace, captured from the site. The theme's scheme picks the matching capture. */}
              <Image
                src={workspaceLight}
                alt="The puzzle workspace: the prompt on the left, then the file tree and outline, the code of src/context.ts at line 768, and the answer tray with Context.redirect added as the first step."
                className={styles.shotLight}
                sizes="(max-width: 1280px) 100vw, 1232px"
                priority
              />
              <Image
                src={workspaceDark}
                alt=""
                className={styles.shotDark}
                sizes="(max-width: 1280px) 100vw, 1232px"
              />
            </div>
            <figcaption className={styles.shotCaption}>
              The workspace on{" "}
              <Link href="/puzzles/hono-trace-002">From c.redirect to the response builder</Link>, a Trace puzzle in
              Hono. The start of the chain, which the prompt names, is already added to the answer.
            </figcaption>
          </figure>
        </section>

        <section className={styles.section} id="how" data-reveal aria-labelledby="how-heading">
          <h2 id="how-heading" className={styles.h2}>
            How a puzzle works
          </h2>
          <p className={styles.lede}>One question, worked from start to finish.</p>
          <CodeDemo />
          <div className={styles.limits}>
            <h3 className={styles.h3}>What it doesn&apos;t do</h3>
            <ul>
              {LIMITS.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${styles.section} ${styles.tinted}`} id="types" data-reveal aria-labelledby="types-heading">
          <div className={styles.sectionInner}>
            <h2 id="types-heading" className={styles.h2}>
              Four kinds of puzzle
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
                    <p className={styles.exampleRepo}>{example.repo}</p>
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
              Most engineering work happens in code someone else wrote
            </h2>
            <div className={styles.prose}>
              <p>
                Before you can change that code, you have to find where a behavior lives, follow a request through its
                layers, and see where a new piece would belong. It&apos;s a skill, and it improves with practice.
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
          <p className={styles.closingText} data-testid="landing-learn">
            New to reading code? <Link href="/learn">Learn</Link> starts from your first line of code, with small examples
            and checks you answer by choosing, before you open a real repository.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
