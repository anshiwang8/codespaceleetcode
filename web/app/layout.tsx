import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/site/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Codebase Puzzles", template: "%s · Codebase Puzzles" },
  description: "Read real open-source code in a browser IDE and answer by clicking on it.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0e10" },
    { media: "(prefers-color-scheme: light)", color: "#f2f0eb" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SiteHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
