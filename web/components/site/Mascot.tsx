import {
  MASCOT_FORMS,
  MASCOT_PAINT_VARIABLES,
  mascotEdgeShapes,
  mascotShapes,
  type MascotForm,
} from "@/components/site/mascot-geometry";

/**
 * The mascot (components/site/mascot-geometry.ts): `form="full"` is the seated figure with the magnifier,
 * `form="head"` the head used in the logo. Decorative, so whatever holds it gives any accessible
 * name. Its viewBox is square and it takes its width from its container. Its colors are the fixed
 * --mascot-* custom properties of app/globals.css; on dark schemes --mascot-edge draws a light edge
 * behind the outline. It never animates.
 */
export function Mascot({ form = "full", className }: { form?: MascotForm; className?: string }) {
  const [x, y, side] = MASCOT_FORMS[form].box;
  return (
    <svg
      className={className}
      viewBox={`${x} ${y} ${side} ${side}`}
      width="100%"
      style={{ display: "block", height: "auto", aspectRatio: "1" }}
      aria-hidden="true"
      focusable="false"
    >
      <g style={{ stroke: "var(--mascot-edge)" }} strokeLinejoin="round">
        {mascotEdgeShapes(form).map(({ d, width, filled, butt }, index) => (
          <path
            key={index}
            d={d}
            style={{ fill: filled ? "var(--mascot-edge)" : "none" }}
            strokeWidth={width}
            strokeLinecap={butt ? "butt" : "round"}
          />
        ))}
      </g>
      {mascotShapes(form).map((shape, index) => (
        <path
          key={index}
          d={shape.d}
          style={{
            fill: shape.fill ? MASCOT_PAINT_VARIABLES[shape.fill] : "none",
            stroke: shape.stroke ? MASCOT_PAINT_VARIABLES[shape.stroke] : undefined,
          }}
          strokeWidth={shape.stroke ? shape.width : undefined}
          strokeLinecap={shape.butt ? "butt" : "round"}
          strokeLinejoin="round"
          opacity={shape.opacity}
        />
      ))}
    </svg>
  );
}
