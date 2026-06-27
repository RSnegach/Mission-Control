"use client";

import { useTheme } from "../ThemeProvider";
import { colors } from "../ui";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_TICKS = [0, 6, 12, 18];

/** Mix two hex colors by t in [0,1]. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

/**
 * Calls by hour-of-day (x) and day-of-week (y). Custom CSS grid, not Recharts.
 * Cell color interpolates from the card surface to the accent by count/max.
 */
export default function HeatmapChart({ grid, max }: { grid: number[][]; max: number }) {
  const { palette } = useTheme();

  if (max === 0) {
    return (
      <div style={{ height: 200, display: "grid", placeItems: "center", color: colors.muted, fontSize: 13 }}>
        No calls in range.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 6, minWidth: 520 }}>
        {/* rows */}
        {DOW.map((day, d) => (
          <div key={day} style={{ display: "contents" }}>
            <div style={{ fontSize: 11, color: colors.muted, display: "flex", alignItems: "center" }}>
              {day}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
              {grid[d].map((count, h) => {
                const t = count === 0 ? 0 : 0.15 + 0.85 * (count / max);
                const bg = count === 0 ? palette.border : mix(palette.card, palette.accent, t);
                return (
                  <div
                    key={h}
                    title={`${day} ${hourLabel(h)}: ${count} call${count === 1 ? "" : "s"}`}
                    style={{ height: 16, borderRadius: 2, background: bg }}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {/* hour axis */}
        <div />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, marginTop: 4 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ fontSize: 9, color: colors.muted, textAlign: "center" }}>
              {HOUR_TICKS.includes(h) ? hourLabel(h) : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}
