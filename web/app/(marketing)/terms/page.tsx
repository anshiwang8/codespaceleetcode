import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Terms" };
export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <LegalPage page="terms" title="Terms">
      <p>By using codebases you agree to these terms. If you don&apos;t agree, please don&apos;t use the site.</p>

      <h2>The service</h2>
      <p>
        codebases offers puzzles about reading code. It&apos;s provided as is, without any warranty, and may change,
        pause or stop at any time. We aren&apos;t liable for any loss that comes from using it, to the extent the law
        allows.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in with GitHub and must follow GitHub&apos;s own terms. Keep your GitHub account secure: whoever
        controls it controls your codebases account. You can delete your account at any time from your{" "}
        <Link href="/profile">profile</Link>.
      </p>

      <h2>Fair use</h2>
      <p>Please don&apos;t:</p>
      <ul>
        <li>try to get answer keys or solutions other than by solving puzzles;</li>
        <li>send automated traffic that strains the site, or get around its rate limits;</li>
        <li>break into, probe or disrupt the site or other people&apos;s accounts.</li>
      </ul>
      <p>We may suspend or remove accounts that do.</p>

      <h2>The code in the puzzles</h2>
      <p>
        Each puzzle is set in an open-source repository at a fixed commit. That code belongs to its authors and is
        shown under its own license, which each puzzle names and links to. These terms don&apos;t change those
        licenses. Puzzle prompts, hints and solutions are ours.
      </p>

      <h2>Privacy</h2>
      <p>
        What we keep about you is described in the <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The date at the top says when they last changed. Using the site after a change
        means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms go to <ContactLine />.
      </p>
    </LegalPage>
  );
}
