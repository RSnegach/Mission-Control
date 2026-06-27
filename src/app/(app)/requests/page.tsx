import Link from "next/link";
import {
  getPrimaryBusiness,
  getSettings,
  listRequests,
  listMissedRequests,
  getContactsByIds,
} from "@/lib/data";
import { slaBuckets, type SlaBucket } from "@/lib/analytics";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { RequestsManager, type RequestRow } from "@/components/RequestsManager";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<SlaBucket, string> = {
  overdue: "overdue",
  dueSoon: "due soon",
  onTrack: "on track",
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const { bucket: bucketParam } = await searchParams;
  const bucket: SlaBucket | null =
    bucketParam === "overdue" || bucketParam === "dueSoon" || bucketParam === "onTrack"
      ? bucketParam
      : null;

  const business = await getPrimaryBusiness();
  if (!business) {
    return (
      <>
        <PageHeader title="Requests" />
        <Empty text="No business found. Mock seed missing." />
      </>
    );
  }

  const settings = await getSettings(business.id);
  const slaMinutes = settings?.callback_sla_minutes ?? 60;

  // Bucket drill-down shows the urgency-filtered OPEN queue; otherwise the full
  // board across all statuses so the owner can triage and see completed work.
  let requests;
  if (bucket) {
    const open = await listMissedRequests(business.id, 500);
    const { items } = slaBuckets(open, Date.now(), slaMinutes);
    requests = items.filter((i) => i.bucket === bucket).map((i) => i.request);
  } else {
    requests = await listRequests(business.id, 500);
  }

  const contactIds = requests.map((r) => r.contact_id).filter((id): id is string => Boolean(id));
  const contacts = await getContactsByIds(business.id, contactIds);

  const rows: RequestRow[] = requests.map((r) => {
    const c = r.contact_id ? contacts.get(r.contact_id) : null;
    return {
      request: r,
      clientId: c?.id ?? null,
      clientName: c?.name || c?.phone || "Unknown",
    };
  });

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle={
          bucket
            ? `${rows.length} ${BUCKET_LABEL[bucket]} callback${rows.length === 1 ? "" : "s"}`
            : "Triage, schedule, and close out callback requests"
        }
        actions={
          bucket ? (
            <Link href="/requests" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 14 }}>
              Show all
            </Link>
          ) : undefined
        }
      />
      <RequestsManager rows={rows} timezone={business.timezone} />
    </>
  );
}
