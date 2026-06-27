"use client";

import { useEffect, useMemo, useState } from "react";
import type { Call, Message } from "@/lib/types";
import {
  METRICS,
  METRIC_PRESETS,
  DEFAULT_METRICS,
  resolveRange,
  computeMetricSeries,
  toCsv,
  type MetricKey,
  type TimeRange,
} from "@/lib/analytics";
import { useLocalStorage, LS_PRESET } from "@/lib/useLocalStorage";
import TrendChart from "./charts/TrendChart";
import { colors } from "./ui";

const PRESET_BY_KEY = new Map(METRIC_PRESETS.map((p) => [p.key, p]));

function sameSet(a: MetricKey[], b: MetricKey[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((k) => s.has(k));
}

/**
 * Trends overlay: choose a metric preset (or Custom), plot the selected metrics
 * over the shared range, and export the series as CSV. Preset choice persists.
 */
export function AnalyticsPanel({
  calls,
  messages,
  timezone,
  range,
}: {
  calls: Call[];
  messages: Message[];
  timezone: string;
  range: TimeRange;
}) {
  const [presetKey, setPresetKey] = useLocalStorage<string>(LS_PRESET, "default");
  const [checked, setChecked] = useState<Set<MetricKey>>(new Set(DEFAULT_METRICS));

  // When a stored preset loads (or changes), apply its metric set.
  useEffect(() => {
    const preset = PRESET_BY_KEY.get(presetKey);
    if (preset) setChecked(new Set(preset.metrics));
    // presetKey is the only trigger; custom toggles set presetKey to "custom".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey]);

  const selected = useMemo(
    () => METRICS.filter((m) => checked.has(m.key)).map((m) => m.key),
    [checked],
  );

  const data = useMemo(() => {
    const resolved = resolveRange(range, timezone);
    return computeMetricSeries({ calls, messages }, selected, resolved, timezone);
  }, [calls, messages, selected, range, timezone]);

  function toggle(key: MetricKey) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Switching individual metrics means we are no longer on a named preset.
      const arr = [...next];
      const match = METRIC_PRESETS.find((p) => sameSet(p.metrics, arr));
      setPresetKey(match ? match.key : "custom");
      return next;
    });
  }

  function exportCsv() {
    const csv = toCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mission-control-trends-${range.preset}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {METRIC_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPresetKey(p.key)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${colors.border}`,
                background: presetKey === p.key ? "var(--accent)" : "transparent",
                color: presetKey === p.key ? "#fff" : colors.muted,
              }}
            >
              {p.label}
            </button>
          ))}
          {presetKey === "custom" ? (
            <span
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: `1px solid var(--accent)`,
                color: "var(--accent)",
              }}
            >
              Custom
            </span>
          ) : null}
        </div>
        <button
          onClick={exportCsv}
          disabled={data.length === 0 || selected.length === 0}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            border: `1px solid ${colors.border}`,
            background: "transparent",
            color: colors.muted,
          }}
        >
          Export CSV
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginBottom: 14 }}>
        {METRICS.map((m) => {
          const on = checked.has(m.key);
          return (
            <label
              key={m.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 13,
                cursor: "pointer",
                color: on ? colors.foreground : colors.muted,
              }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(m.key)}
                style={{ accentColor: m.color, width: 15, height: 15 }}
              />
              <span
                aria-hidden
                style={{ width: 10, height: 10, borderRadius: 2, background: m.color, opacity: on ? 1 : 0.35 }}
              />
              {m.label}
            </label>
          );
        })}
      </div>

      {selected.length === 0 ? (
        <div style={{ height: 320, display: "grid", placeItems: "center", color: colors.muted, fontSize: 13 }}>
          Select a metric to plot.
        </div>
      ) : (
        <TrendChart data={data} metrics={selected} />
      )}
    </div>
  );
}
