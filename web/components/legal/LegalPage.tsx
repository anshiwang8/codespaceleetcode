import Link from "next/link";
import styles from "@/components/legal/legal.module.css";
import { Icon } from "@/components/site/Icon";
import { Logo } from "@/components/site/Logo";
import { SiteFooter } from "@/components/site/SiteFooter";
import { formatLongDay } from "@/lib/format";
import { LEGAL, type LegalPageKey } from "@/lib/legal";

/** The frame both legal pages share: the logo home, the title, the date, and the draft notice. */
export function LegalPage({
  page,
  title,
  children,
}: {
  page: LegalPageKey;
  title: string;
  children: React.ReactNode;
}) {
  const { reviewed, lastUpdated } = LEGAL.PAGES[page];
  return (
    <>
      <main className={styles.page}>
        <Link href="/" className={styles.home} aria-label="codebases home">
          <Logo size="medium" />
        </Link>
        <h1>{title}</h1>
        <p className={styles.updated}>
          Last updated{" "}
          <time dateTime={lastUpdated}>{formatLongDay(lastUpdated)}</time>
        </p>
        {reviewed ? null : (
          <p
            className={`notice ${styles.draft}`}
            role="note"
            data-testid="legal-draft"
          >
            Draft: this page hasn&apos;t been reviewed yet and may change before
            launch. Notes marked &quot;Needs review&quot; are open questions for
            the reviewer.
          </p>
        )}
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

/** How to reach whoever runs the site, or a note that it's coming. Use it once per page. */
export function ContactLine() {
  return LEGAL.CONTACT ? (
    <a href={`mailto:${LEGAL.CONTACT}`}>{LEGAL.CONTACT}</a>
  ) : (
    <span data-testid="legal-contact-missing">
      the contact address that will be listed here before launch
    </span>
  );
}

/**
 * A point in a draft that needs a person to decide or confirm it before the page is approved: legal
 * wording, operator details, or a provider's retention we can't see from the code. It always shows,
 * so approving a page means resolving and deleting each one, not hiding it.
 */
export function ReviewNote({ children }: { children: React.ReactNode }) {
  return (
    <aside className={styles.review} data-testid="legal-review-note">
      <Icon name="alert" className={styles.reviewIcon} />
      <p>
        <strong>Needs review.</strong> {children}
      </p>
    </aside>
  );
}

export interface LegalSection {
  id: string;
  title: string;
}

/** The page's contents, numbered to match its headings. */
export function LegalContents({
  sections,
}: {
  sections: readonly LegalSection[];
}) {
  return (
    <nav className={styles.contents} aria-labelledby="contents-heading">
      <h2 id="contents-heading" className={styles.contentsHeading}>
        Contents
      </h2>
      <ol>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A numbered section heading whose number and text come from the same list as the contents. */
export function SectionHeading({
  sections,
  id,
}: {
  sections: readonly LegalSection[];
  id: string;
}) {
  const index = sections.findIndex((section) => section.id === id);
  const section = sections[index];
  if (!section) throw new Error(`No legal section ${id}`);
  return (
    <h2 id={id}>
      {index + 1}. {section.title}
    </h2>
  );
}

/** "section 4", linked to that section, so references follow the numbering when sections move. */
export function SectionRef({
  sections,
  id,
  capital = false,
}: {
  sections: readonly LegalSection[];
  id: string;
  capital?: boolean;
}) {
  const index = sections.findIndex((section) => section.id === id);
  if (index < 0) throw new Error(`No legal section ${id}`);
  return (
    <a href={`#${id}`}>
      {capital ? "Section" : "section"} {index + 1}
    </a>
  );
}

/**
 * A table that reads as a table where there's room, and as one labeled block per row on a phone,
 * so three columns never squeeze into a 375px screen.
 */
export function LegalTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly (readonly React.ReactNode[])[];
}) {
  return (
    <div className={styles.tableWrap}>
      {/* The roles keep table semantics for screen readers when the phone layout makes cells blocks. */}
      <table className={`${styles.table} ${styles.stacking}`} role="table">
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th key={column} scope="col" role="columnheader">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((cells, row) => (
            <tr key={row} role="row">
              {cells.map((cell, index) => (
                <td key={index} role="cell" data-label={columns[index]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
