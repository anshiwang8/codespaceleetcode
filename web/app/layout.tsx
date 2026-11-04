import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "codebases", template: "%s · codebases" },
  description:
    "Practice reading real code. Find where behavior lives, trace calls through the layers, and map module boundaries in real open-source repos, in a browser IDE.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

// The app's header and sign-in live in app/(app)/layout.tsx, so the landing page stays static.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
