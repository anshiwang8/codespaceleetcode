import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy" };
export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        codebases is a site for practicing reading code. This page says what we keep about you, why, who else
        handles it, and how to delete it. We keep as little as the site needs to work.
      </p>

      <h2>Browsing without an account</h2>
      <p>
        You can read every puzzle without signing in. We don&apos;t use analytics, advertising or tracking
        cookies, and we set no cookies until you sign in. Like any web server, ours sees your IP address. We use it
        to limit how often one address can search or submit, and those counters are deleted within about an hour.
      </p>

      <h2>When you sign in with GitHub</h2>
      <p>Signing in is only through GitHub. We keep:</p>
      <ul>
        <li>your GitHub username, numeric account ID, display name and avatar URL, from your public GitHub profile;</li>
        <li>the access token GitHub gives us, encrypted. We never use it to read your repositories or act for you;</li>
        <li>
          your sign-in sessions, each with the IP address and browser it started from, so a session can be checked and
          ended;
        </li>
        <li>
          the answers you submit, whether each was right, and how long you spent on the puzzle, which make up your
          progress.
        </li>
      </ul>
      <p>
        We don&apos;t keep your email address: we store a placeholder made from your GitHub account ID instead, and
        we never email you.
      </p>

      <h2>Cookies</h2>
      <p>
        Signing in sets a session cookie, which is needed to keep you signed in. It isn&apos;t used for anything
        else, and signing out removes it.
      </p>

      <h2>Who else handles data</h2>
      <p>The site runs on services that process data for us:</p>
      <ul>
        <li>Vercel hosts the site and keeps short-lived request logs.</li>
        <li>Supabase hosts the database that holds the account data above.</li>
        <li>Cloudflare serves the source files shown in the code viewer, so it sees your IP address.</li>
        <li>GitHub handles sign-in.</li>
      </ul>
      <p>We don&apos;t sell or share your data with anyone else.</p>

      <h2>Deleting your account</h2>
      <p>
        On your <Link href="/profile">profile</Link> page, &quot;Delete account&quot; removes your account, sessions,
        GitHub link and token, submissions and progress straight away. Copies in our providers&apos; backups expire on
        their own schedule. You can also revoke the site&apos;s access in your GitHub settings under Applications.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about your data, write to <ContactLine />.
      </p>
    </LegalPage>
  );
}
