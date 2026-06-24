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
import { hex } from "../ui";
import { axisProps, tooltipProps } from "./tooltip";

/** Calls per hour for today. data: [{ label: "9a", value: 3 }, ...] */
export default function CallsByHourChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={hex.border} vertical={false} />
        <XAxis dataKey="label" interval={2} {...axisProps} />
        <YAxis allowDecimals={false} width={28} {...axisProps} />
        <Tooltip {...tooltipProps} />
        <Bar dataKey="value" name="Calls" fill={hex.accent} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
