import {
  getPrimaryBusiness,
  listCalls,
  listMissedRequests,
} from "@/lib/data";
import { callsByHour, callsByDay, answeredVsMissed, isToday } from "@/lib/analytics";
import { PageHeader } from "@/components/PageHeader";
import { StatCard, StatRow } from "@/components/StatCard";
import { Section, Empty } from "@/components/Section";
import { ChartCard } from "@/components/charts/ChartCard";
import CallsByHourChart from "@/components/charts/CallsByHourChart";
import CallsByDayChart from "@/components/charts/CallsByDayChart";
import AnsweredDonut from "@/components/charts/AnsweredDonut";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const business = await getPrimaryBusiness();

  if (!business) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Empty text="No business found. Mock seed missing." />
      </>
    );
  }

  const tz = business.timezone;
  const [calls, missed] = await Promise.all([
    listCalls(business.id, 500),
    listMissedRequests(business.id, 100),
  ]);

  const todays = calls.filter((c) => c.created_at && isToday(c.created_at, tz));
  const callsToday = todays.length;
  const missedToday = todays.filter((c) => c.status === "missed").length;
  const answeredToday = todays.filter((c) => c.status === "answered").length;
  const answeredRate =
    answeredToday + missedToday > 0
      ? Math.round((answeredToday / (answeredToday + missedToday)) * 100)
      : null;

  const byHour = callsByHour(calls, tz);
  const byDay = callsByDay(calls, tz, 7);
  const donut = answeredVsMissed(calls, tz);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${business.name} · operations overview`}
      />

      <StatRow>
        <StatCard label="Calls today" value={String(callsToday)} />
        <StatCard label="Missed today" value={String(missedToday)} accent="#ef4444" />
        <StatCard
          label="Answered rate"
          value={answeredRate === null ? "—" : `${answeredRate}%`}
          accent="#22c55e"
        />
        <StatCard label="Open callbacks" value={String(missed.length)} accent="#eab308" />
      </StatRow>

      <Section title="Activity">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <ChartCard title="Calls by hour (today)" flex="2 1 380px">
            <CallsByHourChart data={byHour} />
          </ChartCard>
          <ChartCard title="Answered vs missed (today)" flex="1 1 260px">
            <AnsweredDonut data={donut} />
          </ChartCard>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
          <ChartCard title="Calls per day (last 7 days)" flex="1 1 100%">
            <CallsByDayChart data={byDay} />
          </ChartCard>
        </div>
      </Section>
    </>
  );
}
