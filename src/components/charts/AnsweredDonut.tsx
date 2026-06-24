"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useTheme } from "../ThemeProvider";
import { colors } from "../ui";
import { tooltipProps } from "./tooltip";

/** Answered vs missed donut. data: [{ name, value, color }] */
export default function AnsweredDonut({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const { palette: p } = useTheme();
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div style={{ height: 220, display: "grid", placeItems: "center", color: colors.muted, fontSize: 13 }}>
        No calls today yet.
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Tooltip {...tooltipProps(p)} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            stroke={p.card}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* Center total */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: colors.foregroundStrong }}>{total}</div>
          <div style={{ fontSize: 11, color: colors.muted }}>calls today</div>
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4 }}>
        {data.map((d) => (
          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: "inline-block" }} />
            <span style={{ color: colors.muted }}>
              {d.name} {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
