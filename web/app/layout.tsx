import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PREPAINT_SCRIPT } from "@/lib/themes/prepaint";
import { siteOrigin } from "@/lib/server/site";

const DESCRIPTION =
  "Practice reading real code. Find where behavior lives, trace calls through the layers, and map module boundaries in real open-source repos, in a browser IDE.";

export const metadata: Metadata = {
  // Makes the social preview image's URL absolute, which link previews need.
  metadataBase: new URL(siteOrigin()),
  title: { default: "codebases", template: "%s · codebases" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "codebases", description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

// The app's header and sign-in live in app/(app)/layout.tsx, so the landing page stays static.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The pre-paint script sets a saved theme's colors on <html> before React runs, so React's
    // copy of <html> differs from the server's in its style attribute; that's expected.
    <html lang="en-US" suppressHydrationWarning>
      <head>
        {/* A fixed string, no user data: applies the theme cached in this browser before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
