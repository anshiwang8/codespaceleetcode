import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Its badge sits on top of the file tree and tabs.
  devIndicators: false,
  // `next dev` allows one server per build folder, so `pnpm e2e` uses its own and can run beside `pnpm dev`.
  ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
};

export default nextConfig;
