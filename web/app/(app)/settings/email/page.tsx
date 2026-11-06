import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailPanel } from "@/components/settings/EmailPanel";
import styles from "@/components/settings/settings.module.css";
import { getCurrentUser } from "@/lib/server/auth";
import { getEmailStatus } from "@/lib/server/email";

export const metadata: Metadata = { title: "Add your email", robots: { index: false, follow: false } };

/** The focused step for finishing account setup: a verified contact email. */
export default async function EmailSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/settings");
  const email = await getEmailStatus(user);
  return (
    <main className={`page ${styles.focused}`} data-testid="email-setup">
      <h1 className="page-title">{email.address ? "Your email" : "Add your email"}</h1>
      <p className="page-lede">
        {email.address
          ? "Your account is set up. You can change your contact email here or in Settings."
          : "One step left to finish setting up your account. Your puzzles and progress are already saved, and you can keep practicing in the meantime."}
      </p>
      <div className="card">
        <EmailPanel initial={email} provider={user.via} />
      </div>
      <p className={styles.hint}>
        Sign out, privacy information and account deletion are always in <Link href="/settings#email">Settings</Link>.
        Read what codebases keeps in the <Link href="/privacy">privacy policy</Link>.
      </p>
    </main>
  );
}
