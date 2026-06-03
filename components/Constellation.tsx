"use client";

// Renders the home sky map: seven fixed constellation figures with
// dashed connecting lines and tiny labels beneath. Tapping a figure
// fires onPick(key). Spec 7.2 / 7.2 Seven Figures.

import { FIGURES } from "@/lib/constellations";
import { categoryByKey, CategoryKey } from "@/lib/categories";

export default function Constellation({
  onPick,
}: {
  onPick: (key: CategoryKey) => void;
}) {
  return (
    <svg
      viewBox="0 0 100 178"
      className="w-full h-full"
      style={{ maxHeight: "100%" }}
      preserveAspectRatio="xMidYMid meet"
    >
      {FIGURES.map((fig) => {
        const cat = categoryByKey(fig.key);
        // figure centroid for the tap target
        const cx =
          fig.dots.reduce((s, d) => s + d[0], 0) / fig.dots.length;
        const cy =
          fig.dots.reduce((s, d) => s + d[1], 0) / fig.dots.length;
        return (
          <g
            key={fig.key}
            onClick={() => onPick(fig.key)}
            style={{ cursor: "pointer" }}
            className="group"
          >
            {/* generous invisible tap target */}
            <rect
              x={Math.min(...fig.dots.map((d) => d[0])) - 8}
              y={Math.min(...fig.dots.map((d) => d[1])) - 8}
              width={
                Math.max(...fig.dots.map((d) => d[0])) -
                Math.min(...fig.dots.map((d) => d[0])) +
                16
              }
              height={
                Math.max(...fig.dots.map((d) => d[1])) -
                Math.min(...fig.dots.map((d) => d[1])) +
                16
              }
              fill="transparent"
            />

            {/* dashed lines */}
            {fig.edges.map(([a, b], i) => (
              <line
                key={i}
                x1={fig.dots[a][0]}
                y1={fig.dots[a][1]}
                x2={fig.dots[b][0]}
                y2={fig.dots[b][1]}
                stroke="#b3b3b3"
                strokeWidth={0.3}
                strokeDasharray="1.2 1.2"
                opacity={0.55}
                className="transition-opacity group-hover:opacity-90"
              />
            ))}

            {/* dots */}
            {fig.dots.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={fig.big ? 2.6 : 0.95}
                fill="#ffffff"
                className={fig.big ? "dot-breathe" : "transition-all group-hover:r-[1.3]"}
                style={
                  fig.big
                    ? { filter: "drop-shadow(0 0 3px rgba(255,255,255,0.7))" }
                    : { filter: "drop-shadow(0 0 1.5px rgba(255,255,255,0.5))" }
                }
              />
            ))}

            {/* floating ? above surprise me */}
            {fig.big && (
              <text
                x={cx}
                y={cy - 6}
                textAnchor="middle"
                fontSize="3.4"
                fill="#d4d4d4"
                fontStyle="italic"
              >
                ?
              </text>
            )}

            {/* label */}
            <text
              x={fig.labelX}
              y={fig.labelY}
              textAnchor="middle"
              fontSize="2.7"
              fill="#d4d4d4"
              className="select-none"
            >
              {cat?.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
