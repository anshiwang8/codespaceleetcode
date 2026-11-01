import type { NextConfig } from "next";

// The root CLAUDE.md is the only rules file, so next dev shouldn't generate another.
const nextConfig: NextConfig = { agentRules: false };

export default nextConfig;
