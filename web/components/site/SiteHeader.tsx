import Link from "next/link";
import { AuthControl, AuthErrorBanner, EmailSetupBanner } from "@/components/site/AuthControl";
import { Logo } from "@/components/site/Logo";
import { NavLinks } from "@/components/site/NavLinks";
import styles from "@/components/site/site.module.css";

export function SiteHeader() {
  return (
    <>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link href="/" className={styles.brand} aria-label="codebases home">
            <Logo size="small" wordClassName={styles.brandWord} />
          </Link>
          <NavLinks />
          <AuthControl />
        </div>
      </header>
      <AuthErrorBanner />
      <EmailSetupBanner />
    </>
  );
}
