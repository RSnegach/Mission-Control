"use client";

import { useMemo, useState } from "react";
import type { Call, Message } from "@/lib/types";
import {
  METRICS,
  DEFAULT_METRICS,
  resolveRange,
  computeMetricSeries,
  type MetricKey,
  type TimeRange,
} from "@/lib/analytics";
import TrendChart from "./charts/TrendChart";
import { colors } from "./ui";

/**
 * Trends overlay: pick any combination of metrics to plot on one chart. The time
 * range is controlled by the parent dashboard (shared across the whole page), so
 * this only owns which metrics are checked.
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
  const [checked, setChecked] = useState<Set<MetricKey>>(new Set(DEFAULT_METRICS));

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
      return next;
    });
  }

  return (
    <div>
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
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: m.color,
                  opacity: on ? 1 : 0.35,
                }}
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
