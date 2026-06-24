import {
  getPrimaryBusiness,
  listCalls,
  listMissedRequests,
  listRecentMessages,
} from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { DashboardView } from "@/components/DashboardView";

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

  const [calls, missed, messages] = await Promise.all([
    listCalls(business.id, 5000),
    listMissedRequests(business.id, 100),
    listRecentMessages(business.id, 5000),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${business.name} · operations overview`} />
      <DashboardView
        calls={calls}
        messages={messages}
        missedCount={missed.length}
        timezone={business.timezone}
      />
    </>
  );
}
