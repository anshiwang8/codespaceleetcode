import { ImageResponse } from "next/og";
import { MARK_NODE_RADIUS, MARK_NODES, MARK_PATH, MARK_RADIUS, MARK_SIZE, MARK_STROKE } from "@/components/site/mark";

// The preview shown when a link to the site is shared. Made at build time from this markup, with
// the mark of components/site/mark.ts and the colors of codebases Light (app/globals.css).
export const alt = "codebases: practice reading real code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

const TEXT = "#111827";
const MUTED = "#4b5563";
const LINE = "#e5e7eb";
const ACCENT = "#2563eb";
const ACCENT_INK = "#ffffff";

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
          color: TEXT,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg width={104} height={104} viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}>
            <rect width={MARK_SIZE} height={MARK_SIZE} rx={MARK_RADIUS} fill={ACCENT} />
            <path
              d={MARK_PATH}
              fill="none"
              stroke={ACCENT_INK}
              strokeWidth={MARK_STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {MARK_NODES.map(({ cx, cy }) => (
              <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={MARK_NODE_RADIUS} fill={ACCENT_INK} />
            ))}
          </svg>
          <div style={{ display: "flex", marginLeft: 32, fontSize: 84, fontWeight: 700, letterSpacing: "-0.04em" }}>
            codebases
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 56,
            paddingTop: 48,
            borderTop: `2px solid ${LINE}`,
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          Practice reading real code.
        </div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: MUTED, lineHeight: 1.35, maxWidth: 980 }}>
          Find where behavior lives, trace calls through the layers, and map module boundaries in real
          open-source repos, in a browser IDE.
        </div>
      </div>
    ),
    size,
  );
}
