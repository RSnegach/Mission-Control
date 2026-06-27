"use client";

import { useTheme } from "../ThemeProvider";

/**
 * Tiny inline-SVG sparkline for KPI cards. Hand-drawn (not Recharts) to stay
 * cheap at ~60px. Flat baseline when data is empty or all equal.
 */
export default function Sparkline({
  data,
  color,
  width = 96,
  height = 28,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const { palette } = useTheme();
  const stroke = color ?? palette.accent;

  if (!data || data.length === 0) {
    return <svg width={width} height={height} aria-hidden />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const n = data.length;
  const dx = n > 1 ? width / (n - 1) : 0;
  const pad = 2;
  const usable = height - pad * 2;

  const points = data.map((v, i) => {
    const x = i * dx;
    const y = pad + usable - ((v - min) / span) * usable;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Area fill under the line for a fuller look.
  const areaPath =
    n > 1
      ? `M0,${height} L${points.join(" L")} L${(n - 1) * dx},${height} Z`
      : "";

  return (
    <svg width={width} height={height} aria-hidden style={{ display: "block" }}>
      {n > 1 ? <path d={areaPath} fill={stroke} opacity={0.12} /> : null}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
