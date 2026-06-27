import Link from "next/link";
import {
  getPrimaryBusiness,
  getSettings,
  listMissedRequests,
  getContactsByIds,
} from "@/lib/data";
import { slaBuckets, type SlaBucket } from "@/lib/analytics";
import { formatTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { Table, Th, Td } from "@/components/Table";
import { RequestStatusBadge, PriorityBadge } from "@/components/Badge";
import { colors, rowBorder } from "@/components/ui";

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

  const tz = business.timezone;
  const [allRequests, settings] = await Promise.all([
    listMissedRequests(business.id, 200),
    getSettings(business.id),
  ]);
  const slaMinutes = settings?.callback_sla_minutes ?? 60;

  const now = Date.now();
  // Order by urgency (most overdue first); filter to a bucket when requested.
  const { items } = slaBuckets(allRequests, now, slaMinutes);
  const shown = bucket ? items.filter((i) => i.bucket === bucket) : items;
  const requests = shown.map((i) => i.request);

  const contactIds = requests
    .map((r) => r.contact_id)
    .filter((id): id is string => Boolean(id));
  const contacts = await getContactsByIds(business.id, contactIds);

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle={
          bucket
            ? `${requests.length} ${BUCKET_LABEL[bucket]} callback${requests.length === 1 ? "" : "s"}`
            : `${requests.length} open callback${requests.length === 1 ? "" : "s"}, most urgent first`
        }
        actions={
          bucket ? (
            <Link href="/requests" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 14 }}>
              Show all
            </Link>
          ) : undefined
        }
      />

      {requests.length === 0 ? (
        <Empty text={bucket ? `No ${BUCKET_LABEL[bucket]} callbacks.` : "No open requests."} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Client</Th>
              <Th>Status</Th>
              <Th>Priority</Th>
              <Th>Created</Th>
              <Th>Due</Th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const contact = r.contact_id ? contacts.get(r.contact_id) : null;
              const overdue = r.due_at ? new Date(r.due_at).getTime() < now : false;
              return (
                <tr key={r.id} style={rowBorder}>
                  <Td>{r.title}</Td>
                  <Td>
                    {contact ? (
                      <Link href={`/clients/${contact.id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                        {contact.name || contact.phone || "Unknown"}
                      </Link>
                    ) : (
                      <span style={{ color: colors.muted }}>Unknown</span>
                    )}
                  </Td>
                  <Td>
                    <RequestStatusBadge status={r.status} />
                  </Td>
                  <Td>
                    <PriorityBadge priority={r.priority} />
                  </Td>
                  <Td>{formatTime(r.created_at, tz)}</Td>
                  <Td>
                    <span style={{ color: overdue ? colors.danger : colors.foreground }}>
                      {formatTime(r.due_at, tz)}
                      {overdue ? " · overdue" : ""}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
