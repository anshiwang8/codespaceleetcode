import { withAuth } from "@/lib/server/better-auth";

// Better Auth's own routes: GitHub sign-in and its callback, the session, and sign-out.
// The instance is built on the first request, because `next build` loads this module with no
// database or secrets.
export function GET(request: Request): Promise<Response> {
  return withAuth((auth) => auth.handler(request));
}

export function POST(request: Request): Promise<Response> {
  return withAuth((auth) => auth.handler(request));
}
