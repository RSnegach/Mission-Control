"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../ThemeProvider";
import { colors } from "../ui";
import { axisProps, tooltipProps } from "./tooltip";

/** Calls per day over the last N days. data: [{ label: "Mon 23", value: 5 }, ...] */
export default function CallsByDayChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const { palette: p } = useTheme();
  if (data.every((d) => d.value === 0)) {
    return (
      <div style={{ height: 220, display: "grid", placeItems: "center", color: colors.muted, fontSize: 13 }}>
        No calls in range.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="callsArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={p.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(p)} />
        <YAxis allowDecimals={false} width={28} {...axisProps(p)} />
        <Tooltip {...tooltipProps(p)} />
        <Area
          type="monotone"
          dataKey="value"
          name="Calls"
          stroke={p.accent}
          strokeWidth={2}
          fill="url(#callsArea)"
          dot={{ r: 3, fill: p.accent, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
