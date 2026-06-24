"use client";

import { useMemo, useState } from "react";
import type { Call, Message } from "@/lib/types";
import {
  callsByHour,
  answeredVsMissed,
  resolveRange,
  inResolvedRange,
  type TimeRange,
} from "@/lib/analytics";
import { StatCard, StatRow } from "./StatCard";
import { Section } from "./Section";
import { ChartCard } from "./charts/ChartCard";
import CallsByHourChart from "./charts/CallsByHourChart";
import AnsweredDonut from "./charts/AnsweredDonut";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { TimeRangeControls } from "./charts/TimeRangeControls";

/** Short scope label for the stat cards, e.g. "this month". */
function rangeHint(range: TimeRange): string {
  switch (range.preset) {
    case "today":
      return "today";
    case "week":
      return "last 7 days";
    case "month":
      return "last 30 days";
    case "year":
      return "last 12 months";
    case "custom":
      return "selected range";
  }
}

/**
 * Client dashboard. Owns one shared time range that drives the stat cards, both
 * Activity charts, and the Trends overlay. "Open callbacks" stays live (current
 * queue depth), independent of the range.
 */
export function DashboardView({
  calls,
  messages,
  missedCount,
  timezone,
}: {
  calls: Call[];
  messages: Message[];
  missedCount: number;
  timezone: string;
}) {
  const [range, setRange] = useState<TimeRange>({ preset: "month" });

  const resolved = useMemo(() => resolveRange(range, timezone), [range, timezone]);

  const inRange = useMemo(
    () => calls.filter((c) => c.created_at && inResolvedRange(c.created_at, resolved)),
    [calls, resolved],
  );

  const total = inRange.length;
  const missed = inRange.filter((c) => c.status === "missed").length;
  const answered = inRange.filter((c) => c.status === "answered").length;
  const answeredRate =
    answered + missed > 0 ? Math.round((answered / (answered + missed)) * 100) : null;

  const byHour = useMemo(() => callsByHour(inRange, timezone), [inRange, timezone]);
  const donut = useMemo(() => answeredVsMissed(inRange, timezone), [inRange, timezone]);
  const hint = rangeHint(range);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <TimeRangeControls range={range} onChange={setRange} />
      </div>

      <StatRow>
        <StatCard label="Calls" value={String(total)} hint={hint} />
        <StatCard label="Missed" value={String(missed)} accent="#ef4444" hint={hint} />
        <StatCard
          label="Answered rate"
          value={answeredRate === null ? "—" : `${answeredRate}%`}
          accent="#22c55e"
          hint={hint}
        />
        <StatCard label="Open callbacks" value={String(missedCount)} accent="#eab308" hint="live" />
      </StatRow>

      <Section title="Activity">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <ChartCard title="Calls by hour" flex="2 1 380px">
            <CallsByHourChart data={byHour} />
          </ChartCard>
          <ChartCard title="Answered vs missed" flex="1 1 260px">
            <AnsweredDonut data={donut} />
          </ChartCard>
        </div>
      </Section>

      <Section title="Trends">
        <ChartCard title="Overlay metrics over time" flex="1 1 100%">
          <AnalyticsPanel calls={calls} messages={messages} timezone={timezone} range={range} />
        </ChartCard>
      </Section>
    </>
  );
}
