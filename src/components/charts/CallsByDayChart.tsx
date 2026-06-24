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
import { hex } from "../ui";
import { axisProps, tooltipProps } from "./tooltip";

/** Calls per day over the last N days. data: [{ label: "Mon 23", value: 5 }, ...] */
export default function CallsByDayChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={hex.border} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis allowDecimals={false} width={28} {...axisProps} />
        <Tooltip {...tooltipProps} />
        <Line
          type="monotone"
          dataKey="value"
          name="Calls"
          stroke={hex.accent}
          strokeWidth={2}
          dot={{ r: 3, fill: hex.accent }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
