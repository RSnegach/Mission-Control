"use client";

import type { Palette } from "@/lib/theme";

/** Dark/light tooltip + axis props derived from the active palette. */
export function tooltipProps(p: Palette) {
  return {
    contentStyle: {
      background: p.surface,
      border: `1px solid ${p.border}`,
      borderRadius: 8,
      color: p.foreground,
      fontSize: 12,
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
    },
    labelStyle: { color: p.muted },
    itemStyle: { color: p.foreground },
    cursor: { fill: "rgba(127,127,127,0.10)" },
  } as const;
}

export function axisProps(p: Palette) {
  return {
    stroke: p.border,
    tick: { fill: p.muted, fontSize: 11 },
    tickLine: false,
  } as const;
}
