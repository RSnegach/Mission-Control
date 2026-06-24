"use client";

import type { RangePreset, TimeRange } from "@/lib/analytics";
import { colors } from "../ui";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimeRangeControls({
  range,
  onChange,
}: {
  range: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  const start = range.start ?? isoDaysAgo(30);
  const end = range.end ?? isoToday();

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 4 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() =>
              onChange(
                preset.key === "custom"
                  ? { preset: "custom", start, end }
                  : { preset: preset.key },
              )
            }
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: `1px solid ${colors.border}`,
              background: range.preset === preset.key ? "var(--accent)" : "transparent",
              color: range.preset === preset.key ? "#fff" : colors.muted,
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {range.preset === "custom" ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => onChange({ preset: "custom", start: e.target.value, end })}
            style={dateInput}
          />
          <span style={{ color: colors.muted, fontSize: 13 }}>to</span>
          <input
            type="date"
            value={end}
            min={start}
            max={isoToday()}
            onChange={(e) => onChange({ preset: "custom", start, end: e.target.value })}
            style={dateInput}
          />
        </div>
      ) : null}
    </div>
  );
}

const dateInput: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--card)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
  outline: "none",
};
