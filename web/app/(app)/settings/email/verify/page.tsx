import type { Metadata } from "next";
import { VerifyEmail } from "@/components/settings/VerifyEmail";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
  // The token is in this page's URL; never send it on to another site.
  referrer: "no-referrer",
};

export default function VerifyEmailPage() {
  return <VerifyEmail />;
}
