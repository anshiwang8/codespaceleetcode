import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ArchiveList } from "@/components/challenges/ArchiveList";
import styles from "@/components/challenges/challenges.module.css";
import { challengeName, PERIOD_NOUNS } from "@/components/challenges/copy";
import { KindTabs } from "@/components/challenges/KindTabs";
import { formatLongDay } from "@/lib/format";
import { isPeriodStart, PERIOD_KINDS, PERIOD_LABELS } from "@/lib/periods";
import { getCurrentUser } from "@/lib/server/auth";
import { getChallengeArchive } from "@/lib/server/challenges";

export const metadata: Metadata = {
  title: "Past challenges",
  description: "Every earlier daily, weekly and monthly challenge, open to practice.",
};

const kindSchema = z.enum(PERIOD_KINDS);

export default async function ChallengeArchivePage({ searchParams }: PageProps<"/challenges/archive">) {
  const params = await searchParams;
  // A bad value in the URL falls back to the default rather than failing the page.
  const parsedKind = kindSchema.safeParse(params.kind);
  const kind = parsedKind.success ? parsedKind.data : "daily";
  const before = typeof params.before === "string" && isPeriodStart(kind, params.before) ? params.before : null;

  const user = await getCurrentUser();
  const archive = await getChallengeArchive(user?.id ?? null, kind, before);
  const noun = PERIOD_NOUNS[kind];
  const label = PERIOD_LABELS[kind].toLowerCase();

  return (
    <main className={`page ${styles.page}`} data-testid="challenge-archive">
      <div className="page-header">
        <div>
          <p className={styles.back}>
            <Link href="/challenges">Current challenges</Link>
          </p>
          <h1 className="page-title">Past challenges</h1>
          <p className="page-lede">
            Every earlier challenge, newest first. An ended challenge&apos;s puzzle is still open to practice, but
            solving it now doesn&apos;t earn the bonus or count toward a streak.
          </p>
        </div>
      </div>

      <div className={styles.archiveBar}>
        <KindTabs kind={kind} />
        {before ? (
          <p className={styles.archivePosition} data-testid="archive-position">
            Showing {label} challenges before {formatLongDay(before)}.{" "}
            <Link href={`/challenges/archive?kind=${kind}`}>Back to the newest</Link>
          </p>
        ) : null}
      </div>

      <section aria-label={`Past ${label} challenges`} className={styles.archiveSection}>
        {archive.items.length === 0 ? (
          <div className="empty" data-testid="archive-empty">
            <strong>{before ? `There are no earlier ${label} challenges.` : `No ${label} challenge has ended yet.`}</strong>
            <span>
              {before
                ? "You've reached the first one. Go back to the newest to see the rest."
                : `The first ${challengeName(kind).toLowerCase()} is still open. It shows here once its ${noun} ends.`}
            </span>
            <Link href={before ? `/challenges/archive?kind=${kind}` : "/challenges"} className="btn btn-small">
              {before ? "Back to the newest" : "See current challenges"}
            </Link>
          </div>
        ) : (
          <ArchiveList items={archive.items} signedIn={user !== null} />
        )}
      </section>

      {archive.nextBefore ? (
        <p className={styles.older}>
          <Link
            href={`/challenges/archive?kind=${kind}&before=${archive.nextBefore}`}
            className="btn"
            data-testid="archive-older"
          >
            Older challenges
          </Link>
        </p>
      ) : null}
    </main>
  );
}
