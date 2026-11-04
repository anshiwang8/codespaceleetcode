import { NotFoundMessage } from "@/components/site/NotFoundMessage";

// notFound() from a page or layout in the app, such as a missing puzzle. The (app) layout around
// this already gives the header.
export default function NotFound() {
  return <NotFoundMessage />;
}
