import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RETURNING_SCRIPT } from "@/lib/returning";
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
        {/*
          Fixed strings, no user data, in one tag: applies the theme cached in this browser before
          first paint, then marks a browser someone has signed in on, so the landing page offers
          "To puzzles". Each part is its own try/catch IIFE, so one failing never stops the other.
        */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT + RETURNING_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
