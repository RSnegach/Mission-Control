"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../ThemeProvider";
import { axisProps, tooltipProps } from "./tooltip";

/**
 * Calls per hour for today. data: [{ label: "9a", value: 3 }, ...], one entry per
 * hour 0..23 in order, so the array index is the hour. onBarClick(hour) enables
 * drill-down to the Calls page filtered to that hour.
 */
export default function CallsByHourChart({
  data,
  onBarClick,
}: {
  data: { label: string; value: number }[];
  onBarClick?: (hour: number) => void;
}) {
  const { palette: p } = useTheme();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
        onClick={(state) => {
          if (onBarClick && state && typeof state.activeTooltipIndex === "number") {
            onBarClick(state.activeTooltipIndex);
          }
        }}
      >
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="label" interval={2} {...axisProps(p)} />
        <YAxis allowDecimals={false} width={28} {...axisProps(p)} />
        <Tooltip {...tooltipProps(p)} />
        <Bar
          dataKey="value"
          name="Calls"
          fill={p.accent}
          radius={[3, 3, 0, 0]}
          maxBarSize={26}
          isAnimationActive={false}
          cursor={onBarClick ? "pointer" : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
