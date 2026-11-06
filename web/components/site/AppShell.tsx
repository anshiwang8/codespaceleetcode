import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/site/SiteHeader";
import styles from "@/components/site/site.module.css";

/** The app's chrome: who's signed in, and the header. The landing page goes without it. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SiteHeader />
      {/* The skip link's target. tabIndex lets it take focus without being in the tab order. */}
      <div id="main" tabIndex={-1} className={styles.content}>
        {children}
      </div>
    </AuthProvider>
  );
}
