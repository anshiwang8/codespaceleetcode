import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy" };
export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <LegalPage page="privacy" title="Privacy policy">
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
        GitHub sign-in itself doesn&apos;t give us your email: our sign-in records hold a placeholder made from your
        GitHub account ID.
      </p>

      <h2>Your email address</h2>
      <p>
        To finish setting up an account, we ask for an email address and confirm it by sending a link. We use it
        only to reach you about your account: confirmation links, and a notice to your old address when you change
        it. We don&apos;t send newsletters or marketing, it isn&apos;t shown to anyone, and you still sign in only
        with GitHub. While a new address waits for confirmation we keep it, and a fingerprint (hash) of the link,
        for up to 30 minutes.
      </p>

      <h2>What you can add in Settings</h2>
      <p>All of these are optional, can be removed at any time, and are shown only to you:</p>
      <ul>
        <li>a display name, pronouns and a short bio;</li>
        <li>a birthday, stored as a date only. We never show an age or use it for anything;</li>
        <li>links to your other profiles and sites, which we don&apos;t visit or check;</li>
        <li>
          a profile picture. We crop and re-encode it, which removes any location or camera data in the file, and keep
          only the small result in our database;
        </li>
        <li>your theme and favorite themes.</li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>
        Signing in sets a session cookie, which is needed to keep you signed in. It isn&apos;t used for anything
        else, and signing out removes it. Your theme is also remembered in your browser&apos;s local storage, so a
        page can show it before it loads; when you&apos;re signed out, that choice stays in your browser and
        isn&apos;t sent to us.
      </p>

      <h2>Who else handles data</h2>
      <p>The site runs on services that process data for us:</p>
      <ul>
        <li>Vercel hosts the site and keeps short-lived request logs.</li>
        <li>Supabase hosts the database that holds the account data above.</li>
        <li>Cloudflare serves the source files shown in the code viewer, so it sees your IP address.</li>
        <li>GitHub handles sign-in.</li>
        <li>An email delivery service (Resend) sends confirmation emails and change notices.</li>
      </ul>
      <p>We don&apos;t sell or share your data with anyone else.</p>

      <h2>Deleting your account</h2>
      <p>
        In <Link href="/settings#email">Settings</Link>, &quot;Delete account&quot; removes your account, sessions,
        GitHub link and token, submissions, progress, email address, profile details, links, picture and theme
        choices straight away. Copies in our providers&apos; backups expire on
        their own schedule. You can also revoke the site&apos;s access in your GitHub settings under Applications.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about your data, write to <ContactLine />.
      </p>
    </LegalPage>
  );
}
