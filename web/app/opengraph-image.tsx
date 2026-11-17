import { ImageResponse } from "next/og";
import { MASCOT_COLORS, MASCOT_FORMS, WORDMARK, mascotShapes } from "@/components/site/mascot-geometry";

// The preview shown when a link to the site is shared. Made at build time from this markup, with
// the head and wordmark of components/site/mascot-geometry.ts and the colors of codebases Light
// (app/globals.css).
export const alt = "codebases: practice reading real code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

const TEXT = "#111827";
const MUTED = "#4b5563";
const LINE = "#e5e7eb";
const [HEAD_X, HEAD_Y, HEAD_SIDE] = MASCOT_FORMS.head.box;
// The word is 84px tall text: its x-height band is 71 of the wordmark's 105 units.
const WORD_HEIGHT = 66;
const HEAD_SIZE = Math.round((WORD_HEIGHT * HEAD_SIDE) / WORDMARK.height);

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
          <svg width={HEAD_SIZE} height={HEAD_SIZE} viewBox={`${HEAD_X} ${HEAD_Y} ${HEAD_SIDE} ${HEAD_SIDE}`}>
            {mascotShapes("head").map((shape, index) => (
              <path
                key={index}
                d={shape.d}
                fill={shape.fill ? MASCOT_COLORS[shape.fill] : "none"}
                stroke={shape.stroke ? MASCOT_COLORS[shape.stroke] : undefined}
                strokeWidth={shape.stroke ? shape.width : undefined}
                strokeLinecap={shape.butt ? "butt" : "round"}
                strokeLinejoin="round"
                opacity={shape.opacity}
              />
            ))}
          </svg>
          <svg
            width={Math.round((WORD_HEIGHT * WORDMARK.width) / WORDMARK.height)}
            height={WORD_HEIGHT}
            viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
            style={{ marginLeft: 3, marginBottom: 12 }}
          >
            <path d={WORDMARK.d} fill={TEXT} />
          </svg>
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
