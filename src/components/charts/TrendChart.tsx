"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../ThemeProvider";
import { METRICS, type MetricKey } from "@/lib/analytics";
import { axisProps, tooltipProps } from "./tooltip";

const BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

/**
 * Multi-metric overlay. One line per selected metric in its own color. Percent
 * metrics (answer rate) draw on a separate right-hand axis so they do not
 * dwarf single-digit counts on the left axis.
 */
export default function TrendChart({
  data,
  metrics,
}: {
  data: Array<Record<string, number | string>>;
  metrics: MetricKey[];
}) {
  const { palette: p } = useTheme();
  const hasPercent = metrics.some((k) => BY_KEY.get(k)?.unit === "percent");

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: hasPercent ? 8 : 16, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(p)} minTickGap={24} />
        <YAxis yAxisId="count" allowDecimals={false} width={36} {...axisProps(p)} />
        {hasPercent ? (
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            width={36}
            {...axisProps(p)}
          />
        ) : null}
        <Tooltip {...tooltipProps(p)} />
        {metrics.map((key) => {
          const def = BY_KEY.get(key);
          if (!def) return null;
          const isPct = def.unit === "percent";
          return (
            <Line
              key={key}
              yAxisId={isPct ? "pct" : "count"}
              type="monotone"
              dataKey={key}
              name={def.label}
              stroke={def.color}
              strokeWidth={2}
              dot={{ r: 2, fill: def.color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
