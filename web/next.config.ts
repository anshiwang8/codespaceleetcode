import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { securityHeaders } from "./lib/security-headers";

const LIST_FILTER_KEYS = ["type", "difficulty", "repo", "tag", "group", "sort"];

export default function nextConfig(phase: string): NextConfig {
  const headers = securityHeaders({
    dev: phase === PHASE_DEVELOPMENT_SERVER,
    snapshotCdnUrl: process.env.NEXT_PUBLIC_SNAPSHOT_CDN_URL,
  });
  return {
    // The root CLAUDE.md is the only rules file, so next dev shouldn't generate another.
    agentRules: false,
    // Its badge sits on top of the file tree and tabs.
    devIndicators: false,
    // `next dev` allows one server per build folder, so `pnpm e2e` uses its own and can run beside `pnpm dev`.
    ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
    // Next.js says which framework served the page otherwise.
    poweredByHeader: false,
    // CSP, HSTS and the rest on every response. lib/security-headers.ts explains each one.
    headers() {
      return Promise.resolve([{ source: "/:path*", headers }]);
    },
    // The puzzle list moved from / to /puzzles. Old links with list filters keep working.
    redirects() {
      return Promise.resolve(
        LIST_FILTER_KEYS.map((key) => ({
          source: "/",
          has: [{ type: "query" as const, key }],
          destination: "/puzzles",
          permanent: false,
        })),
      );
    },
  };
}
