import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/legal/legal.module.css";
import {
  ContactLine,
  LegalContents,
  ReviewNote,
  LegalPage,
  LegalTable,
  SectionHeading,
  SectionRef,
} from "@/components/legal/LegalPage";
import { DELETE_CONFIRMATION, DELETED_DATA } from "@/lib/account-deletion";
import { PUBLIC_NAME_MAX, PUBLIC_NAME_MIN } from "@/lib/leaderboard-name";
import { SCORING } from "@/lib/scoring";

export const metadata: Metadata = { title: "Privacy policy" };
export const dynamic = "force-static";

// Every statement here must match what the code does. When storage, cookies, providers or
// retention change, update this page in the same change and set the privacy page back to draft in
// lib/legal.ts so it's reviewed again (spec.md section 14, M11). Mark open questions in a new
// draft with <ReviewNote>; the reviewer resolves and deletes each one before approving.
const SECTIONS = [
  { id: "without-account", title: "Using the site without an account" },
  { id: "github", title: "Signing in with GitHub" },
  { id: "activity", title: "Your puzzle activity" },
  { id: "progress", title: "Hints, points, challenges and achievements" },
  { id: "learn", title: "Learn lesson progress" },
  { id: "leaderboard", title: "The leaderboard" },
  { id: "email", title: "Your contact email" },
  { id: "optional", title: "Details you choose to add" },
  { id: "security-records", title: "Sign-in sessions and security records" },
  { id: "not-collected", title: "What we don't do" },
  { id: "purposes", title: "Why we use your data" },
  { id: "retention", title: "How long we keep it" },
  { id: "providers", title: "Who else handles your data" },
  { id: "cookies", title: "Cookies and browser storage" },
  { id: "security", title: "How we protect it" },
  { id: "rights", title: "Your choices and rights" },
  { id: "delete", title: "Deleting your account" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const UNTIL_CLEARED = "Until you clear your browser's site data";

export default function PrivacyPage() {
  const heading = (id: SectionId) => <SectionHeading sections={SECTIONS} id={id} />;
  const ref = (id: SectionId, capital = false) => <SectionRef sections={SECTIONS} id={id} capital={capital} />;
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
          With an account, we keep your GitHub identity, your puzzle activity (including the hints you reveal, your
          points, challenges and achievements), a contact email you confirm, and any profile details you choose to
          add. All of it is visible only to you.
        </li>
        <li>
          The leaderboard is off unless you join it. If you do, anyone can see the public name you choose, your rank,
          points and puzzles solved, and nothing else. You can leave at any time.
        </li>
        <li>You can delete your account, and nearly everything with it, from Settings at any time.</li>
      </ul>

      <LegalContents sections={SECTIONS} />

      {heading("without-account")}
      <p>
        Every web request carries your IP address and your browser&apos;s user agent. Our host (Vercel) and, for the
        code shown in the editor, Cloudflare receive them, as any web server would. We use your IP address for one
        thing ourselves: counting how often one address searches the code, loads the leaderboard or challenges, or
        makes sign-in or submission requests, so automated traffic can&apos;t overload the site. Each counter holds
        the address, what was counted and a request count for a window of at most one hour, and is deleted after
        that ({ref("retention")}).
      </p>
      <p>
        Submitting an answer and revealing hints require signing in, so browsing without an account leaves no other
        record with us.
      </p>
      <p>
        Learn lessons work without an account too. Checking a lesson answer, asking for a lesson hint or showing an
        answer sends that request to us so we can grade it, but signed out we don&apos;t record any of it. Your lesson
        progress stays in your browser ({ref("cookies")}).
      </p>
      <ReviewNote>New with Learn (2026-11-13): signed-out lesson checks, hints and reveals are graded but not recorded.</ReviewNote>

      {heading("github")}
      <p>
        GitHub is the only way to sign in. When you sign in for the first time, GitHub asks you to let codebases read
        your public profile and your email addresses (the <code>read:user</code> and <code>user:email</code>{" "}
        permissions). It doesn&apos;t give us access to your repositories, and we can&apos;t act on GitHub for you.
      </p>
      <p>
        Our sign-in software reads your email addresses from GitHub during each sign-in, as part of the standard
        GitHub sign-in flow. <strong>We don&apos;t store them.</strong> Your sign-in record holds a placeholder made
        from your GitHub account ID instead, and the only email address we keep is one you give us yourself (
        {ref("email")}).
      </p>
      <p>From GitHub we store:</p>
      <ul>
        <li>
          your GitHub username and numeric account ID, which identify your account. Neither is ever shown to other
          people, including on the leaderboard;
        </li>
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

      {heading("activity")}
      <p>When you submit an answer while signed in, we store:</p>
      <ul>
        <li>which puzzle it was for and the answer you selected;</li>
        <li>whether it was correct, and when you submitted it;</li>
        <li>how long the puzzle had been open in your browser when you submitted, measured by the page.</li>
      </ul>
      <p>
        From these we show your progress, your activity calendar and streaks, and your history. Grading is automatic:
        your selection is compared with the puzzle&apos;s answer key. Your submissions also decide your points,
        achievements and challenge completions ({ref("progress")}), by fixed rules that are the same for everyone. These
        results only change what the site shows. We don&apos;t use your activity to profile you or to make any other
        decision about you.
      </p>

      {heading("progress")}
      <p>While you&apos;re signed in, we also record:</p>
      <ul>
        <li>
          <strong>Hints you reveal.</strong> Hints open one level at a time, and we record each level you reveal on
          each puzzle, and when, before showing it. We use this to score your solve (each hint revealed before you
          solve a puzzle takes {SCORING.hintPenalty} points off it; hints revealed afterward cost nothing) and to award
          the Independent Thinker achievement, for solving a puzzle without revealing any of its hints.
        </li>
        <li>
          <strong>Points.</strong> The first time you solve a puzzle, we record its points and how they were worked
          out: the points for its difficulty, a bonus if your first submission was correct, and any hint deduction.
          Completing a challenge adds a bonus. Each entry records when it was earned.
        </li>
        <li>
          <strong>Challenges.</strong> Every day, week and month, one puzzle is the challenge, the same one for
          everyone. When you solve it while that challenge is open, we record that you completed it, and when. Your
          challenge streak is worked out from these records whenever it&apos;s shown, not stored separately.
        </li>
        <li>
          <strong>Achievements.</strong> Which achievements you&apos;ve earned, when the activity that earned each one
          happened, and when we recorded it. They&apos;re worked out from your submissions, hints and challenges.
        </li>
      </ul>
      <p>
        Puzzles you solved before we started recording hints were given points from your submission history, with no
        hint deduction. None of this is shown to anyone but you unless you join the leaderboard, and even then only
        your totals are ({ref("leaderboard")}).
      </p>

      {heading("learn")}
      <p>
        When you&apos;re signed in and answer one of a lesson&apos;s required checks correctly, we record which lesson,
        which version of it, which of its required checks you&apos;ve answered correctly, and when you finished it.
        That&apos;s all. We don&apos;t record wrong answers, the hints you ask for, the answers you choose to show, or
        what you write in the capstone&apos;s explanation box, which never leaves your browser. Learn progress
        isn&apos;t shown to anyone else, and it doesn&apos;t affect points, challenges or the leaderboard.
      </p>
      <p>
        Progress you made while signed out stays in that browser and isn&apos;t copied into your account when you sign
        in.
      </p>
      <ReviewNote>New with Learn (2026-11-13): what lesson progress records for a signed-in account, and that it stays
        private and apart from points.</ReviewNote>

      {heading("leaderboard")}
      <p>
        The leaderboard is opt-in and off by default: nobody appears on it until they choose to. To join, open{" "}
        <Link href="/settings">Settings</Link>, go to Leaderboard visibility, and choose a public name ({PUBLIC_NAME_MIN}{" "}
        to {PUBLIC_NAME_MAX} letters, numbers, spaces and . _ - &apos;). It&apos;s separate from your display name and
        your GitHub username, so it reveals neither unless you type it in. Each public name can be used by only one
        account, ignoring capitals.
      </p>
      <p>
        Anyone can see the leaderboard, signed in or not. For each person who joined and has points in the period
        shown (all time, today, this week or this month), it shows:
      </p>
      <ul>
        <li>their public name and rank;</li>
        <li>their points and how many puzzles they first solved in that period;</li>
        <li>
          when they reached that total, which breaks ties. This shows when they last earned points in that
          period.
        </li>
      </ul>
      <p>
        Your totals include points you earned before you joined. The leaderboard never shows your GitHub username,
        display name, email address, picture, account ID, submissions, answers, hints, achievements or profile. To
        run it, we store your public name and when you joined.
      </p>
      <p>
        You can rename yourself or leave at any time in Settings, under Leaderboard visibility. Leaving deletes your
        entry and public name immediately, and you disappear from every period&apos;s leaderboard at once. Your points
        stay on your account, visible only to you, so if you join again later your totals come back. While signed in,
        you see your own points and standing even when you haven&apos;t joined; no one else does. People who viewed
        the leaderboard while you were on it may still remember or have copied what it showed. We may remove a public
        name that breaks the <Link href="/terms">terms</Link>.
      </p>

      {heading("email")}
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
        We don&apos;t send newsletters, marketing, or reminders about streaks or challenges, we don&apos;t show your
        address to anyone, and you still sign in only with GitHub. Changing a confirmed address requires a sign-in
        within the last 15 minutes.
      </p>
      <p>
        For each link we send, we keep the address it was for and a fingerprint (SHA-256 hash) of the link, never the
        link itself, so a stolen copy of our database can&apos;t be used to confirm an address. {ref("retention", true)} says how
        long these records stay.
      </p>

      {heading("optional")}
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
        None of these appear on the leaderboard. Please don&apos;t put information in these fields that you
        wouldn&apos;t want stored, such as health information or anything about other people.
      </p>

      {heading("security-records")}
      <ul>
        <li>
          <strong>Sessions.</strong> Each time you sign in, we create a session record with the time, the IP address
          and the browser user agent it started from. These let us check a session is genuine and end it. The time
          also tells us whether you signed in recently, which changing your email and deleting your account require.
        </li>
        <li>
          <strong>Sign-in checks.</strong> While you sign in, we keep a random value that ties GitHub&apos;s reply to
          the sign-in you started. It holds no personal information and stops working after 10 minutes.
        </li>
        <li>
          <strong>Rate limits.</strong> While signed in, your submissions, hint reveals, searches, leaderboard and
          challenge requests, leaderboard changes, picture uploads, email requests and account deletion attempts are
          counted by account instead of by IP address; sign-in requests are always counted by IP address. Counters
          work as described in {ref("without-account")}.
        </li>
        <li>
          <strong>Error logs.</strong> When something fails, our server writes an error message to our host&apos;s
          logs. We write these messages to leave out email addresses, confirmation links and answers. A sign-in error
          can include a GitHub username, for example when a renamed GitHub account&apos;s old username now belongs to
          someone else.
        </li>
      </ul>

      {heading("not-collected")}
      <ul>
        <li>We don&apos;t use analytics, advertising, social media widgets, tracking pixels or browser fingerprinting.</li>
        <li>
          Every script, style and font on the site comes from codebases itself. The only other site your browser
          contacts is our code storage on Cloudflare, for the source files shown in the editor.
        </li>
        <li>We don&apos;t sell, rent or trade your data, or share it for advertising.</li>
        <li>We don&apos;t use your data to train AI models.</li>
        <li>We don&apos;t read your GitHub repositories, follow your links, or contact you except as in {ref("email")}.</li>
        <li>
          There are no public profiles or comments. Your profile, activity, hints, points and achievements are never
          shown to other people. The leaderboard is the one public feature, and you appear on it only if you join
          ({ref("leaderboard")}).
        </li>
      </ul>

      {heading("purposes")}
      <p>If you&apos;re in the European Economic Area, the UK or Switzerland, these are the legal bases we rely on:</p>
      <ul>
        <li>
          <strong>To provide the service you signed up for</strong> (performing our agreement with you, the{" "}
          <Link href="/terms">terms</Link>): your GitHub identity, sessions, puzzle activity, hint reveals, points,
          challenge completions, achievements and confirmed email.
        </li>
        <li>
          <strong>To keep the site secure and available</strong> (our legitimate interest, which doesn&apos;t
          override your rights because the records are minimal and short-lived): rate-limit counters, session IP
          addresses and user agents, sign-in checks and error logs.
        </li>
        <li>
          <strong>Because you chose to</strong> (your consent, which you can withdraw at any time): the details in{" "}
          {ref("optional")}, which you withdraw by removing them, and your leaderboard entry, which you withdraw by leaving.
        </li>
        <li>
          <strong>To meet legal obligations</strong>, such as answering a valid legal request, if one ever applies.
        </li>
      </ul>

      {heading("retention")}
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
              <td>Learn progress</td>
              <td>You delete your account.</td>
            </tr>
            <tr>
              <td>Submissions, progress and history</td>
              <td>You delete your account.</td>
            </tr>
            <tr>
              <td>Hint reveals, points, challenge completions and achievements</td>
              <td>You delete your account. Leaving the leaderboard doesn&apos;t remove them.</td>
            </tr>
            <tr>
              <td>Leaderboard entry and public name</td>
              <td>You leave the leaderboard or delete your account. Either removes them immediately.</td>
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
              <td>Stop working after 10 minutes. Removed when used, and expired ones are removed at the next sign-in.</td>
            </tr>
            <tr>
              <td>Rate-limit counters</td>
              <td>
                Each counts for at most an hour. Cleanup that runs as the site is used deletes counters more than an
                hour old, so one can stay a little longer when the site is quiet. Your account&apos;s counters go at
                once when you delete it.
              </td>
            </tr>
            <tr>
              <td>Host request and error logs, provider backups, emails already sent</td>
              <td>Each provider&apos;s own retention schedule ({ref("providers")}).</td>
            </tr>
            <tr>
              <td>Messages you send to our contact address</td>
              <td>Kept in that mailbox until we delete them.</td>
            </tr>
          </tbody>
        </table>
      </div>

      {heading("providers")}
      <p>
        These service providers process data for us to run the site. Each may use it only to provide its service to
        us, under its own privacy terms:
      </p>
      <LegalTable
        columns={["Provider", "What it does", "What it handles"]}
        rows={[
          [
            "Vercel",
            "Hosts the website and its server",
            "Every request, including IP address and user agent; short-lived request and error logs",
          ],
          ["Supabase", "Hosts our database", "All the account data described above"],
          ["Cloudflare", "Stores and serves the source files shown in the editor", "IP address, user agent and which file was requested"],
          ["GitHub", "Handles sign-in", "That you signed in to codebases, under GitHub's own privacy statement"],
          ["Google (Gmail)", "Sends our emails", "The recipient address and the message, including any confirmation link"],
        ]}
      />
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

      {heading("cookies")}
      <p>
        We use only what the site needs to work, so there&apos;s no cookie banner. None of these are used for
        tracking or advertising.
      </p>
      <LegalTable
        columns={["Name", "Purpose", "Lasts"]}
        rows={[
          [
            <>
              <code>better-auth.state</code> (cookie)
            </>,
            "Ties GitHub's reply to the sign-in you started",
            "5 minutes, set only when you start signing in",
          ],
          [
            <>
              <code>better-auth.session_token</code> (cookie)
            </>,
            "Keeps you signed in",
            "Until you sign out, or 7 days after its last refresh",
          ],
          [
            <>
              <code>cb-theme</code> (local storage)
            </>,
            "Remembers the colors of your current theme so pages show it before they finish loading",
            UNTIL_CLEARED,
          ],
          [
            <>
              <code>cb-theme-guest</code>, <code>cb-theme-favorites</code> (local storage)
            </>,
            "Your theme choice and favorites while signed out. They stay in your browser and aren't sent to us",
            UNTIL_CLEARED,
          ],
          [
            <>
              <code>cb-learn-progress</code> (local storage)
            </>,
            "Your Learn progress while signed out: which lessons and checks you've completed in this browser. It stays in your browser and isn't sent to us",
            UNTIL_CLEARED,
          ],
          [
            <>
              <code>cb-signed-in</code> (local storage)
            </>,
            "Remembers that someone has signed in on this browser, so the home page offers To puzzles instead of sign-in. It holds only the value 1, isn't sent to us, and is cleared when you sign out or delete your account",
            UNTIL_CLEARED,
          ],
          [
            <>
              <code>cp-dev-login</code> (local storage)
            </>,
            "A random name, such as dev-3f2a, for the sign-in developers use when they run the site on their own computer. This site may store it, but never uses it or sends it to us",
            UNTIL_CLEARED,
          ],
          [
            <>
              <code>cp_dev_login</code> (cookie)
            </>,
            "That same developer sign-in. Only a copy of the site running on a developer's own computer sets it",
            "30 days",
          ],
        ]}
      />
      <p>
        Over HTTPS, the sign-in cookie names start with <code>__Secure-</code>. Both are first-party, unreadable by
        page scripts, and sent only to codebases. Signing out deletes the session cookie and its session record, and
        deleting your account clears it too. Because we don&apos;t track you, there&apos;s nothing for a
        browser&apos;s Do Not Track or Global Privacy Control signal to turn off.
      </p>

      {heading("security")}
      <ul>
        <li>All traffic uses HTTPS, and browsers are told to use only HTTPS for the site.</li>
        <li>
          Only our server can read the database. Browsers can&apos;t query it directly, and access rules in the
          database deny client access to every table holding account data, including hints, points and the
          leaderboard.
        </li>
        <li>GitHub access tokens are encrypted before storage, and email links are stored only as hashes.</li>
        <li>Uploaded pictures are decoded and re-encoded before storage, and never served from the original file.</li>
        <li>
          Requests that change your account, reveal hints or change your leaderboard entry must come from the
          codebases site itself, which blocks cross-site forgery. The requests listed in {ref("security-records")} are rate limited.
        </li>
      </ul>
      <p>
        No system is perfectly secure. If a breach affects your personal data, we&apos;ll tell you at your confirmed
        contact email, and the authorities where the law requires it, without undue delay.
      </p>

      {heading("rights")}
      <p>These controls are yours to use at any time:</p>
      <ul>
        <li>
          <strong>Leaderboard visibility.</strong> Join, change your public name or leave in{" "}
          <Link href="/settings">Settings</Link>, under Leaderboard visibility. You&apos;re not on it unless you join.
        </li>
        <li>
          <strong>See your data.</strong> Your <Link href="/profile">profile</Link> and Settings show your activity
          and everything you&apos;ve added. For a full copy, including session records, hint reveals and points, write
          to us.
        </li>
        <li>
          <strong>Correct or remove it.</strong> Change or clear any optional detail and your picture, and change your
          email, in Settings.
        </li>
        <li>
          <strong>Clear your browser&apos;s copy.</strong> Clearing this site&apos;s data in your browser removes
          everything in {ref("cookies")}. Signing out ends your session in that browser.
        </li>
        <li>
          <strong>Delete your account</strong>, as {ref("delete")} describes.
        </li>
        <li>
          <strong>Revoke GitHub access.</strong> In GitHub, under Settings, Applications, Authorized OAuth Apps, you
          can revoke codebases&apos; access at any time. You&apos;ll be asked again the next time you sign in.
        </li>
        <li>
          <strong>Other rights.</strong> Depending on where you live, including the EEA, the UK and California, you
          may have the right to access, correct, delete or receive a portable copy of your data, to object to or
          restrict how we use it, and to withdraw consent. We don&apos;t sell or share personal information as
          California law defines those terms. We won&apos;t treat you differently for using any of these rights.
        </li>
      </ul>
      <p>
        To make a request, write to the address under <a href="#contact">Contact</a>. We may ask you to confirm the
        request from your confirmed contact email or while signed in, so we know it&apos;s you. We&apos;ll answer
        within 30 days. If you&apos;re not satisfied, you can also complain to your local data protection authority.
      </p>

      {heading("delete")}
      <p>
        In <Link href="/settings">Settings</Link>, under Danger zone, choose Delete account and type{" "}
        <strong>{DELETE_CONFIRMATION}</strong> (in capitals) to confirm. For your security, deleting needs a GitHub
        sign-in within the last 15 minutes; if yours is older, you&apos;ll be asked to sign in with GitHub again
        first. Deleting immediately and permanently removes:
      </p>
      <ul>
        {DELETED_DATA.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        It also removes the records of the email links we sent you and your account&apos;s rate-limit counters, and
        signs you out. It all happens in one step, and it can&apos;t be undone. You disappear from the leaderboard at
        once.
      </p>
      <p>
        Deleting your codebases account doesn&apos;t delete your GitHub account, and it doesn&apos;t remove
        codebases from the apps you&apos;ve authorized on GitHub. To do that, revoke access in GitHub as{" "}
        {ref("rights")}{" "}
        describes. Copies in our providers&apos; logs and backups aren&apos;t reachable by us and expire on their own
        schedules ({ref("retention")}). Emails we already sent stay in your inbox.
      </p>

      {heading("children")}
      <p>
        codebases isn&apos;t meant for children under 13, and GitHub&apos;s terms don&apos;t allow them to have an
        account. If you believe a child under 13 has signed in, write to us and we&apos;ll delete the account.
      </p>

      {heading("changes")}
      <p>
        When what we collect or how we use it changes, we update this page and the date at the top before the change
        takes effect. If a change means we&apos;d use data you&apos;ve already given us in a materially different
        way, we&apos;ll also tell you by email or on the site, and ask for your consent where the law requires it.
      </p>

      {heading("contact")}
      <p>
        For questions about your data or this policy, or to make a request, write to <ContactLine />.
      </p>
    </LegalPage>
  );
}
