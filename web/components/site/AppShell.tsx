import { AuthProvider } from "@/components/auth/AuthProvider";
import { ShellBody } from "@/components/site/ShellBody";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/** The app's chrome: who's signed in, the header and the footer. The landing page goes without it. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SiteHeader />
      <ShellBody footer={<SiteFooter />}>{children}</ShellBody>
    </AuthProvider>
  );
}
