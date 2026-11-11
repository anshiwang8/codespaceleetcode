import type { MetadataRoute } from "next";

// The web app manifest, for "Add to home screen" and app launchers. The icons are drawn by
// scripts/brand-icons.mjs from components/site/mark.ts; the colors are codebases Light's.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "codebases",
    short_name: "codebases",
    description: "Practice reading real code in real open-source repositories.",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
