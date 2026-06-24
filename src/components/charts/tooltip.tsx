"use client";

import { hex } from "../ui";

/** Shared dark tooltip styles for Recharts. */
export const tooltipProps = {
  contentStyle: {
    background: hex.card,
    border: `1px solid ${hex.border}`,
    borderRadius: 8,
    color: hex.foreground,
    fontSize: 12,
  },
  labelStyle: { color: hex.muted },
  itemStyle: { color: hex.foreground },
  cursor: { fill: "rgba(255,255,255,0.04)" },
} as const;

export const axisProps = {
  stroke: hex.muted,
  tick: { fill: hex.muted, fontSize: 11 },
  tickLine: false,
} as const;
