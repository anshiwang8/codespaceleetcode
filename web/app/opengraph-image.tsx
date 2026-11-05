import { ImageResponse } from "next/og";

// The preview shown when a link to the site is shared. Made at build time from this markup, with
// the wordmark and colours of components/site/Logo.tsx and app/globals.css.
export const alt = "codebases: practice reading real code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

const TEXT = "#111827";
const MUTED = "#4b5563";
const ACCENT = "#2563eb";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#ffffff",
          borderTop: `16px solid ${ACCENT}`,
          color: TEXT,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 88, fontWeight: 700, letterSpacing: "-0.02em" }}>
          <span>code</span>
          <span style={{ background: ACCENT, color: "#ffffff", padding: "4px 18px", borderRadius: 12, marginLeft: 6 }}>
            bases
          </span>
        </div>
        <div style={{ display: "flex", marginTop: 48, fontSize: 52, fontWeight: 700, lineHeight: 1.15 }}>
          Practice reading real code.
        </div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: MUTED, lineHeight: 1.35, maxWidth: 960 }}>
          Find where behavior lives, trace calls through the layers, and map module boundaries in real
          open-source repos, in a browser IDE.
        </div>
      </div>
    ),
    size,
  );
}
