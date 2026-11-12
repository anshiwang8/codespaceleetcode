import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms" };
export const dynamic = "force-static";

// Keep these consistent with the privacy policy and with what the code does (spec.md section 14,
// M7 and M11). Mark open questions in a new draft with <ReviewNote>; the reviewer resolves and
// deletes each one before setting the page back to reviewed in lib/legal.ts.
export default function TermsPage() {
  return (
    <LegalPage page="terms" title="Terms">
      <p>By using codebases you agree to these terms. If you don&apos;t agree, please don&apos;t use the site.</p>

      <h2 id="service">The service</h2>
      <p>
        codebases offers puzzles about reading code. It&apos;s provided as is, without any warranty, and may change,
        pause or stop at any time. We aren&apos;t liable for any loss that comes from using it, to the extent the law
        allows.
      </p>

      <h2 id="account">Your account</h2>
      <p>
        You sign in with GitHub and must follow GitHub&apos;s own terms. Keep your GitHub account secure: whoever
        controls it controls your codebases account. You can delete your account at any time in{" "}
        <Link href="/settings">Settings</Link>, under Danger zone. Deleting it doesn&apos;t delete your GitHub
        account.
      </p>

      <h2 id="fair-use">Fair use</h2>
      <p>Please don&apos;t:</p>
      <ul>
        <li>try to get answer keys or solutions other than by solving puzzles;</li>
        <li>use scripts, shared answers or more than one account to earn points, achievements or a higher rank;</li>
        <li>send automated traffic that strains the site, or get around its rate limits;</li>
        <li>break into, probe or disrupt the site or other people&apos;s accounts.</li>
      </ul>
      <p>We may suspend or remove accounts that do, and remove them from the leaderboard.</p>

      <h2 id="leaderboard">The leaderboard</h2>
      <p>
        Joining the leaderboard is optional, and you choose the public name it shows. That name must not:
      </p>
      <ul>
        <li>pretend to be another person or an organization, including codebases;</li>
        <li>be offensive, hateful or sexual, or harass anyone;</li>
        <li>include someone else&apos;s personal information, a link or an advertisement.</li>
      </ul>
      <p>
        We may remove a public name that breaks these rules, or take its account off the leaderboard. You can change
        your name or leave at any time in Settings, under Leaderboard visibility.
      </p>

      <h2 id="points">Points, achievements and rankings</h2>
      <p>
        Points, achievements, streaks and rankings are only a record of practice on this site. They have no monetary
        value, can&apos;t be exchanged, sold or transferred, and aren&apos;t a qualification. We may change how they
        work, or correct them when a puzzle or a score was wrong.
      </p>

      <h2 id="code">The code in the puzzles</h2>
      <p>
        Each puzzle is set in an open-source repository at a fixed commit. That code belongs to its authors and is
        shown under its own license, which each puzzle names and links to. These terms don&apos;t change those
        licenses. Puzzle prompts, hints and solutions are ours.
      </p>

      <h2 id="privacy">Privacy</h2>
      <p>
        What we keep about you, and what the leaderboard shows, is described in the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        We may update these terms. The date at the top says when they last changed. Using the site after a change
        means you accept the new terms.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions about these terms go to <ContactLine />.
      </p>
    </LegalPage>
  );
}
