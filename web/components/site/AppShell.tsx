import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/site/SiteHeader";

/** The app's chrome: who's signed in, and the header. The landing page goes without it. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SiteHeader />
      {children}
    </AuthProvider>
  );
}
