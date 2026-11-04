import { AppShell } from "@/components/site/AppShell";
import { NotFoundMessage } from "@/components/site/NotFoundMessage";

// An unknown URL lands here, inside the root layout only, so this brings the app's header itself.
// A missing puzzle is caught first by app/(app)/not-found.tsx, which already has the header.
export default function NotFound() {
  return (
    <AppShell>
      <NotFoundMessage />
    </AppShell>
  );
}
