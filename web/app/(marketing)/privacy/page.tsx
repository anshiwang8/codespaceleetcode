import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/legal/legal.module.css";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy" };
export const dynamic = "force-static";

// Every statement here must match what the code does. When storage, cookies, providers or
// retention change, update this page in the same change and set the privacy page back to draft in
// lib/legal.ts so it's reviewed again (spec.md section 14, M11).
export default function PrivacyPage() {
  return (
    <LegalPage page="privacy" title="Privacy policy">
      <p>
        codebases is a site for practicing reading code. This policy explains what information we collect, why we
        collect it, who else handles it, how long we keep it, and what you can do about it. It covers the codebases
        website and its sign-in. &quot;We&quot; and &quot;us&quot; mean whoever runs codebases, reachable at the
        address under <a href="#contact">Contact</a>.
      </p>

      <h2 id="summary">The short version</h2>
      <ul>
        <li>
          You can read every puzzle and explore its code without an account, and we set no cookies until you start
          signing in.
        </li>
        <li>We have no analytics, advertising, tracking pixels or third-party scripts, and we don&apos;t sell or rent your data.</li>
        <li>
          With an account, we keep your GitHub identity, your puzzle activity, a contact email you confirm, and any
          profile details you choose to add. Your profile is visible only to you.
        </li>
        <li>You can delete your account, and nearly everything with it, from Settings at any time.</li>
      </ul>

      <h2 id="without-account">1. Using the site without an account</h2>
      <p>
        Every web request carries your IP address and your browser&apos;s user agent. Our host (Vercel) and, for the
        code shown in the editor, Cloudflare receive them, as any web server would. We use your IP address for one
        thing ourselves: counting how often one address searches the code or makes sign-in requests, so automated
        traffic can&apos;t overload the site. Each counter holds the address and a request count for a window of at
        most one hour, and routine cleanup deletes counters older than an hour.
      </p>
      <p>Submitting an answer requires signing in, so browsing without an account leaves no other record with us.</p>

      <h2 id="github">2. Signing in with GitHub</h2>
      <p>
        GitHub is the only way to sign in. When you sign in for the first time, GitHub asks you to let codebases read
        your public profile and your email addresses (the <code>read:user</code> and <code>user:email</code>{" "}
        permissions). It doesn&apos;t give us access to your repositories, and we can&apos;t act on GitHub for you.
      </p>
      <p>
        Our sign-in software reads your email addresses from GitHub during each sign-in, as part of the standard
        GitHub sign-in flow. <strong>We don&apos;t store them.</strong> Your sign-in record holds a placeholder made
        from your GitHub account ID instead, and the only email address we keep is one you give us yourself (section
        4).
      </p>
      <p>From GitHub we store:</p>
      <ul>
        <li>your GitHub username and numeric account ID, which identify your account;</li>
        <li>
          your GitHub display name and the address of your GitHub avatar, which our sign-in software records and
          refreshes at each sign-in. We never show either of them; the name and picture on codebases are the ones you
          set in Settings;
        </li>
        <li>
          the access token GitHub issues and the permissions it carries. The token is encrypted before it&apos;s
          stored, is never sent to your browser, and isn&apos;t used after sign-in.
        </li>
      </ul>

      <h2 id="activity">3. Your puzzle activity</h2>
      <p>When you submit an answer while signed in, we store:</p>
      <ul>
        <li>which puzzle it was for and the answer you selected;</li>
        <li>whether it was correct, and when you submitted it;</li>
        <li>how long the puzzle had been open in your browser when you submitted, measured by the page.</li>
      </ul>
      <p>
        From these we show your progress, your activity calendar and streaks, and your history. Grading is automatic:
        your selection is compared with the puzzle&apos;s answer key. It decides only whether an answer is correct,
        and we don&apos;t use your activity to profile you or make any other decision about you.
      </p>

      <h2 id="email">4. Your contact email</h2>
      <p>
        To finish setting up an account, we ask for an email address. You can keep using the site before you add one.
        We confirm the address by emailing a link that works once, only for the account that asked for it, and only
        for 30 minutes.
      </p>
      <p>We use your confirmed address only to reach you about your account:</p>
      <ul>
        <li>confirmation links when you add or change it;</li>
        <li>
          a notice to your old address when you change it, which shows the new address partly hidden
          (j***@example.com);
        </li>
        <li>
          a notice, instead of a link, if someone tries to add an address that already belongs to another account. It
          doesn&apos;t say which account.
        </li>
      </ul>
      <p>
        We don&apos;t send newsletters or marketing, we don&apos;t show your address to anyone, and you still sign in
        only with GitHub. Changing a confirmed address requires a sign-in within the last 15 minutes.
      </p>
      <p>
        For each link we send, we keep the address it was for and a fingerprint (SHA-256 hash) of the link, never the
        link itself, so a stolen copy of our database can&apos;t be used to confirm an address. Section 9 says how
        long these records stay.
      </p>

      <h2 id="optional">5. Details you choose to add</h2>
      <p>Everything in this section is optional, can be changed or removed in Settings at any time, and is shown only to you:</p>
      <ul>
        <li>a display name (up to 60 characters), pronouns (up to 40) and a short bio (up to 280);</li>
        <li>a birthday, stored as a calendar date only. We never show an age or use it for anything else;</li>
        <li>links to your other profiles and sites, which we check for format but never visit;</li>
        <li>
          a profile picture. We decode your upload, crop it to a 256 by 256 pixel square and re-encode it, which
          strips any location, camera or other data embedded in the file. Only the re-encoded picture (at most 128
          KB) is stored, in our database, and the original file is discarded. It&apos;s served only to you;
        </li>
        <li>your theme, and the themes you mark as favorites.</li>
      </ul>
      <p>
        Please don&apos;t put information in these fields that you wouldn&apos;t want stored, such as health
        information or anything about other people.
      </p>

      <h2 id="security-records">6. Sign-in sessions and security records</h2>
      <ul>
        <li>
          <strong>Sessions.</strong> Each time you sign in, we create a session record with the time, the IP address
          and the browser user agent it started from. These let us check a session is genuine and end it.
        </li>
        <li>
          <strong>Sign-in checks.</strong> While you sign in, we keep a random value that ties GitHub&apos;s reply to
          the sign-in you started. It holds no personal information and stops working after 10 minutes.
        </li>
        <li>
          <strong>Rate limits.</strong> While signed in, your submissions, searches and email requests are counted by
          account instead of by IP address; sign-in requests are always counted by IP address. Counters work as
          described in section 1.
        </li>
        <li>
          <strong>Error logs.</strong> When something fails, our server writes an error message to our host&apos;s
          logs. These messages never include your email address.
        </li>
      </ul>

      <h2 id="not-collected">7. What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t use analytics, advertising, social media widgets, tracking pixels or browser fingerprinting.</li>
        <li>
          Every script, style and font on the site comes from codebases itself. The only other site your browser
          contacts is our code storage on Cloudflare, for the source files shown in the editor.
        </li>
        <li>We don&apos;t sell, rent or trade your data, or share it for advertising.</li>
        <li>We don&apos;t use your data to train AI models.</li>
        <li>We don&apos;t read your GitHub repositories, follow your links, or contact you except as in section 4.</li>
        <li>
          There are no public profiles, leaderboards or comments, so nothing you add or do here is shown to other
          people.
        </li>
      </ul>

      <h2 id="purposes">8. Why we use your data</h2>
      <p>If you&apos;re in the European Economic Area, the UK or Switzerland, these are the legal bases we rely on:</p>
      <ul>
        <li>
          <strong>To provide the service you signed up for</strong> (performing our agreement with you, the{" "}
          <Link href="/terms">terms</Link>): your GitHub identity, sessions, puzzle activity and confirmed email.
        </li>
        <li>
          <strong>To keep the site secure and available</strong> (our legitimate interest, which doesn&apos;t
          override your rights because the records are minimal and short-lived): rate-limit counters, session IP
          addresses and user agents, sign-in checks and error logs.
        </li>
        <li>
          <strong>Because you chose to add it</strong> (your consent, which you can withdraw by removing the detail):
          the details in section 5.
        </li>
        <li>
          <strong>To meet legal obligations</strong>, such as answering a valid legal request, if one ever applies.
        </li>
      </ul>

      <h2 id="retention">9. How long we keep it</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Kept until</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account, GitHub identity and encrypted token</td>
              <td>You delete your account.</td>
            </tr>
            <tr>
              <td>Submissions, progress and history</td>
              <td>You delete your account.</td>
            </tr>
            <tr>
              <td>Confirmed contact email</td>
              <td>You replace it with a newly confirmed one, or delete your account.</td>
            </tr>
            <tr>
              <td>Pending address and link fingerprint</td>
              <td>
                The link stops working after 30 minutes or once used. A pending record is removed when you confirm an
                address or request another link. The record of a link that was used stays until you delete your
                account.
              </td>
            </tr>
            <tr>
              <td>Profile details, links, picture, theme choices</td>
              <td>You remove them in Settings, or delete your account.</td>
            </tr>
            <tr>
              <td>Session records</td>
              <td>
                Removed when you sign out of that session. A session you don&apos;t sign out of stops working 7 days
                after it was last refreshed (it&apos;s refreshed at most once a day while you use the site), and its
                record can stay until you delete your account.
              </td>
            </tr>
            <tr>
              <td>Sign-in checks</td>
              <td>Stop working after 10 minutes, and are removed when used.</td>
            </tr>
            <tr>
              <td>Rate-limit counters</td>
              <td>Deleted by routine cleanup once more than an hour old, and at once for your account&apos;s counters when you delete it.</td>
            </tr>
            <tr>
              <td>Host request and error logs, provider backups, emails already sent</td>
              <td>Each provider&apos;s own retention schedule (section 10).</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="providers">10. Who else handles your data</h2>
      <p>
        These service providers process data for us to run the site. Each may use it only to provide its service to
        us, under its own privacy terms:
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">What it does</th>
              <th scope="col">What it handles</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vercel</td>
              <td>Hosts the website and its server</td>
              <td>Every request, including IP address and user agent; short-lived request and error logs</td>
            </tr>
            <tr>
              <td>Supabase</td>
              <td>Hosts our database</td>
              <td>All the account data described above</td>
            </tr>
            <tr>
              <td>Cloudflare</td>
              <td>Stores and serves the source files shown in the editor</td>
              <td>IP address, user agent and which file was requested</td>
            </tr>
            <tr>
              <td>GitHub</td>
              <td>Handles sign-in</td>
              <td>That you signed in to codebases, under GitHub&apos;s own privacy statement</td>
            </tr>
            <tr>
              <td>Google (Gmail)</td>
              <td>Sends our emails</td>
              <td>The recipient address and the message, including any confirmation link</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        We may also disclose data if the law requires it, or to protect the site or its users from fraud, abuse or
        attack. If codebases is ever transferred to someone else, this policy would continue to apply to the data
        transferred, and we would say so on this page first.
      </p>
      <p>
        These providers are based in the United States and may process data there or in other countries. Where data
        protection law requires it, we rely on the providers&apos; standard contractual clauses or equivalent
        safeguards for these transfers.
      </p>

      <h2 id="cookies">11. Cookies and browser storage</h2>
      <p>
        We use only what the site needs to work, so there&apos;s no cookie banner. None of these are used for
        tracking or advertising.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Purpose</th>
              <th scope="col">Lasts</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>better-auth.state</code> (cookie)
              </td>
              <td>Ties GitHub&apos;s reply to the sign-in you started</td>
              <td>5 minutes, set only when you start signing in</td>
            </tr>
            <tr>
              <td>
                <code>better-auth.session_token</code> (cookie)
              </td>
              <td>Keeps you signed in</td>
              <td>Until you sign out, or 7 days after its last refresh</td>
            </tr>
            <tr>
              <td>
                <code>cb-theme</code> (local storage)
              </td>
              <td>Remembers the colors of your current theme so pages show it before they finish loading</td>
              <td>Until you clear your browser&apos;s site data</td>
            </tr>
            <tr>
              <td>
                <code>cb-theme-guest</code>, <code>cb-theme-favorites</code> (local storage)
              </td>
              <td>Your theme choice and favorites while signed out. They stay in your browser and aren&apos;t sent to us</td>
              <td>Until you clear your browser&apos;s site data</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Over HTTPS, cookie names start with <code>__Secure-</code>. Both cookies are first-party, unreadable by page
        scripts, and sent only to codebases. Signing out deletes the session cookie and its session record. Because
        we don&apos;t track you, there&apos;s nothing for a browser&apos;s Do Not Track or Global Privacy Control
        signal to turn off.
      </p>

      <h2 id="security">12. How we protect it</h2>
      <ul>
        <li>All traffic uses HTTPS, and browsers are told to use only HTTPS for the site.</li>
        <li>
          Only our server can read the database. Browsers can&apos;t query it directly, and access rules in the
          database deny client access to every table holding account data.
        </li>
        <li>GitHub access tokens are encrypted before storage, and email links are stored only as hashes.</li>
        <li>Uploaded pictures are decoded and re-encoded before storage, and never served from the original file.</li>
        <li>
          Requests that change your account must come from the codebases site itself, which blocks cross-site
          forgery, and sign-in, submissions, searches and email requests are rate limited.
        </li>
      </ul>
      <p>
        No system is perfectly secure. If a breach affects your personal data, we&apos;ll tell you at your confirmed
        contact email, and the authorities where the law requires it, without undue delay.
      </p>

      <h2 id="rights">13. Your choices and rights</h2>
      <ul>
        <li>
          <strong>See your data.</strong> Your <Link href="/profile">profile</Link> and{" "}
          <Link href="/settings">Settings</Link> show your activity and everything you&apos;ve added. For a full
          copy, including session records, write to us.
        </li>
        <li>
          <strong>Correct or remove it.</strong> Change or clear any optional detail, and change your email, in
          Settings.
        </li>
        <li>
          <strong>Delete your account.</strong> In <Link href="/settings#email">Settings</Link>, &quot;Delete
          account&quot; immediately and permanently removes your account, sessions, GitHub link and token,
          submissions, progress, contact email and email records, profile details, links, picture, theme choices and
          your account&apos;s rate-limit counters. It can&apos;t be undone. Copies in our providers&apos; logs and
          backups aren&apos;t reachable by us and expire on their own schedules. Emails we already sent stay in your
          inbox.
        </li>
        <li>
          <strong>Revoke GitHub access.</strong> In your GitHub settings under Applications, you can revoke
          codebases&apos; access at any time. You&apos;ll be asked again the next time you sign in.
        </li>
        <li>
          <strong>Other rights.</strong> Depending on where you live, including the EEA, the UK and California, you
          may have the right to access, correct, delete or receive a portable copy of your data, to object to or
          restrict how we use it, and to withdraw consent. We don&apos;t sell or share personal information as
          California law defines those terms. We won&apos;t treat you differently for using any of these rights.
        </li>
      </ul>
      <p>
        To make a request, write to the address below. We may ask you to confirm the request from your confirmed
        contact email or while signed in, so we know it&apos;s you. We&apos;ll answer within 30 days. If you&apos;re
        not satisfied, you can also complain to your local data protection authority.
      </p>

      <h2 id="children">14. Children</h2>
      <p>
        codebases isn&apos;t meant for children under 13, and GitHub&apos;s terms don&apos;t allow them to have an
        account. If you believe a child under 13 has signed in, write to us and we&apos;ll delete the account.
      </p>

      <h2 id="changes">15. Changes to this policy</h2>
      <p>
        When what we collect or how we use it changes, we update this page and the date at the top before the change
        takes effect. If a change means we&apos;d use data you&apos;ve already given us in a materially different
        way, we&apos;ll also tell you by email or on the site, and ask for your consent where the law requires it.
      </p>

      <h2 id="contact">16. Contact</h2>
      <p>
        For questions about your data or this policy, or to make a request, write to <ContactLine />.
      </p>
    </LegalPage>
  );
}
