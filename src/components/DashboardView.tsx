"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Call, CallRequest, Message } from "@/lib/types";
import {
  callsByHour,
  callsByDay,
  answeredVsMissed,
  callsByHourAndDay,
  recoveryFunnel,
  computeKpis,
  kpiSparkline,
  resolveRange,
  inResolvedRange,
  type TimeRange,
} from "@/lib/analytics";
import { useLocalStorage, LS_LIVE, LS_THRESHOLDS } from "@/lib/useLocalStorage";
import { StatCard, StatRow } from "./StatCard";
import { Section } from "./Section";
import { ChartCard } from "./charts/ChartCard";
import CallsByHourChart from "./charts/CallsByHourChart";
import CallsByDayChart from "./charts/CallsByDayChart";
import AnsweredDonut from "./charts/AnsweredDonut";
import HeatmapChart from "./charts/HeatmapChart";
import RecoveryFunnel from "./charts/RecoveryFunnel";
import SlaTracker from "./charts/SlaTracker";
import AlertBanner, { type DashAlert } from "./AlertBanner";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { TimeRangeControls } from "./charts/TimeRangeControls";
import { colors } from "./ui";

interface Thresholds {
  answerRateMin: number; // alert if answer rate below this
  missedMax: number; // alert if missed at/above this
}
const DEFAULT_THRESHOLDS: Thresholds = { answerRateMin: 75, missedMax: 25 };

const LIVE_INTERVAL_MS = 15_000;

function rangeHint(range: TimeRange): string {
  switch (range.preset) {
    case "today": return "today";
    case "week": return "last 7 days";
    case "month": return "last 30 days";
    case "year": return "last 12 months";
    case "custom": return "selected range";
  }
}

/** How many days the resolved range spans, for the calls-by-day chart. */
function spanDays(startMs: number, endMs: number): number {
  return Math.max(1, Math.ceil((endMs - startMs) / 86_400_000));
}

export function DashboardView({
  calls,
  messages,
  requests,
  slaMinutes,
  timezone,
}: {
  calls: Call[];
  messages: Message[];
  requests: CallRequest[];
  slaMinutes: number | null;
  timezone: string;
}) {
  const router = useRouter();
  const [range, setRangeRaw] = useState<TimeRange>({ preset: "month" });
  const [isPending, startTransition] = useTransition();
  const [live, setLive] = useLocalStorage<boolean>(LS_LIVE, false);
  const [thresholds] = useLocalStorage<Thresholds>(LS_THRESHOLDS, DEFAULT_THRESHOLDS);

  // Wrap range changes in a transition so the heavy recompute can show a skeleton.
  const setRange = (r: TimeRange) => startTransition(() => setRangeRaw(r));

  const resolved = useMemo(() => resolveRange(range, timezone), [range, timezone]);
  const inRange = useMemo(
    () => calls.filter((c) => c.created_at && inResolvedRange(c.created_at, resolved)),
    [calls, resolved],
  );

  const kpis = useMemo(() => computeKpis(calls, resolved), [calls, resolved]);
  const sparkCalls = useMemo(() => kpiSparkline(calls, resolved, timezone, "calls"), [calls, resolved, timezone]);
  const sparkMissed = useMemo(() => kpiSparkline(calls, resolved, timezone, "missed"), [calls, resolved, timezone]);
  const sparkRate = useMemo(() => kpiSparkline(calls, resolved, timezone, "answerRate"), [calls, resolved, timezone]);

  const byHour = useMemo(() => callsByHour(inRange, timezone), [inRange, timezone]);
  const byDay = useMemo(
    () => callsByDay(inRange, timezone, spanDays(resolved.startMs, resolved.endMs)),
    [inRange, timezone, resolved],
  );
  const donut = useMemo(() => answeredVsMissed(inRange, timezone), [inRange, timezone]);
  const heat = useMemo(() => callsByHourAndDay(inRange, timezone), [inRange, timezone]);
  const funnel = useMemo(() => recoveryFunnel(calls, messages, resolved), [calls, messages, resolved]);

  const hint = rangeHint(range);
  const answerRateVal = kpis.answerRate.value;
  const missedVal = kpis.missed.value;

  // Threshold breaches.
  const rateBreach = answerRateVal < thresholds.answerRateMin && (kpis.total.value > 0);
  const missedBreach = missedVal >= thresholds.missedMax;
  const alerts: DashAlert[] = [];
  if (rateBreach) alerts.push({ id: "rate", tone: "danger", text: `Answer rate is ${answerRateVal}%, below your ${thresholds.answerRateMin}% target.` });
  if (missedBreach) alerts.push({ id: "missed", tone: "warning", text: `${missedVal} missed calls ${hint}, at or above your alert level of ${thresholds.missedMax}.` });

  // Live auto-refresh: re-run the server component via router.refresh on an
  // interval, paused when the tab is hidden. Reuses the data facade; no new fetch.
  const refresh = useRef(router.refresh);
  refresh.current = router.refresh;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh.current();
    }, LIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [live]);

  const isToday = range.preset === "today";

  // Drill-down helpers.
  const go = (path: string) => router.push(path);

  return (
    <>
      <AlertBanner alerts={alerts} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <TimeRangeControls range={range} onChange={setRange} />
        <button
          onClick={() => setLive(!live)}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${live ? "var(--accent)" : colors.border}`,
            background: live ? "var(--accent)" : "transparent",
            color: live ? "#fff" : colors.muted,
          }}
          title={live ? "Auto-refreshing every 15s" : "Turn on live auto-refresh"}
        >
          <span
            aria-hidden
            style={{ width: 8, height: 8, borderRadius: 999, background: live ? "#fff" : colors.muted }}
          />
          {live ? "Live" : "Live off"}
        </button>
      </div>

      <StatRow>
        <StatCard
          label="Calls"
          value={String(kpis.total.value)}
          hint={hint}
          delta={kpis.total}
          sparkline={sparkCalls}
          loading={isPending}
          href="/calls"
        />
        <StatCard
          label="Missed"
          value={String(missedVal)}
          accent={colors.danger}
          hint={hint}
          delta={kpis.missed}
          deltaGoodWhenDown
          sparkline={sparkMissed}
          sparklineColor={colors.danger}
          thresholdTone={missedBreach ? "warning" : undefined}
          loading={isPending}
          href="/calls?status=missed"
        />
        <StatCard
          label="Answered rate"
          value={kpis.total.value === 0 ? "—" : `${answerRateVal}%`}
          accent={colors.success}
          hint={hint}
          delta={kpis.answerRate}
          sparkline={sparkRate}
          sparklineColor={colors.success}
          thresholdTone={rateBreach ? "danger" : undefined}
          loading={isPending}
          href="/calls?status=answered"
        />
        <StatCard
          label="Open callbacks"
          value={String(requests.length)}
          accent={colors.warning}
          hint="live"
          href="/requests"
        />
      </StatRow>

      {slaMinutes !== null ? (
        <Section title="Callbacks">
          <SlaTracker requests={requests} slaMinutes={slaMinutes} />
        </Section>
      ) : null}

      <Section title="Activity">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <ChartCard title={isToday ? "Calls by hour (today)" : "Calls per day"} flex="2 1 380px">
            {isToday ? (
              <CallsByHourChart data={byHour} onBarClick={(h) => go(`/calls?status=all&hour=${h}`)} />
            ) : (
              <CallsByDayChart data={byDay} />
            )}
          </ChartCard>
          <ChartCard title="Answered vs missed" flex="1 1 260px">
            <AnsweredDonut
              data={donut}
              onSegmentClick={(name) => go(`/calls?status=${name === "Answered" ? "answered" : "missed"}`)}
            />
          </ChartCard>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
          <ChartCard title="Busy times (hour x day)" flex="2 1 460px">
            <HeatmapChart grid={heat.grid} max={heat.max} />
          </ChartCard>
          <ChartCard title="Missed-call recovery" flex="1 1 280px">
            <RecoveryFunnel funnel={funnel} />
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
