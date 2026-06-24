import Link from "next/link";
import {
  getPrimaryBusiness,
  listMissedRequests,
  getContactsByIds,
} from "@/lib/data";
import { formatTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { Table, Th, Td } from "@/components/Table";
import { RequestStatusBadge, PriorityBadge } from "@/components/Badge";
import { colors, rowBorder } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
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
  const requests = await listMissedRequests(business.id, 200);
  const contactIds = requests
    .map((r) => r.contact_id)
    .filter((id): id is string => Boolean(id));
  const contacts = await getContactsByIds(business.id, contactIds);

  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle={`${requests.length} open callback${requests.length === 1 ? "" : "s"}`}
      />

      {requests.length === 0 ? (
        <Empty text="No open requests." />
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
                    <span style={{ color: overdue ? "#ef4444" : colors.foreground }}>
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
