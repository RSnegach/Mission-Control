import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPrimaryBusiness,
  getContactById,
  listCallsByContact,
  listMessagesByContact,
  listRequestsByContact,
  listActivityByContact,
  listTags,
  listTagsForContacts,
} from "@/lib/data";
import { formatTime, formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Section, Empty } from "@/components/Section";
import { Table, Th, Td } from "@/components/Table";
import { CallStatusBadge, RequestStatusBadge } from "@/components/Badge";
import { MessageThread } from "@/components/MessageThread";
import { NotesPanel } from "@/components/NotesPanel";
import { TagEditor } from "@/components/TagEditor";
import { colors, rowBorder, card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const business = await getPrimaryBusiness();
  if (!business) {
    return (
      <>
        <PageHeader title="Client" />
        <Empty text="No business found. Mock seed missing." />
      </>
    );
  }

  const contact = await getContactById(business.id, id);
  if (!contact) notFound();

  const tz = business.timezone;
  const [calls, messages, requests, activity, allTags, tagMap] = await Promise.all([
    listCallsByContact(business.id, id, 100),
    listMessagesByContact(business.id, id, 200),
    listRequestsByContact(business.id, id, 100),
    listActivityByContact(business.id, id, 200),
    listTags(business.id),
    listTagsForContacts(business.id, [id]),
  ]);

  const openRequests = requests.filter((r) => r.status === "needs_callback").length;
  const tagIds = tagMap.get(id) ?? [];

  return (
    <>
      <PageHeader
        title={contact.name || "Unnamed caller"}
        subtitle={contact.phone || undefined}
        actions={
          <Link href="/clients" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 14 }}>
            ← All clients
          </Link>
        }
      />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <MiniStat label="Calls" value={String(calls.length)} />
        <MiniStat label="Messages" value={String(messages.length)} />
        <MiniStat label="Open callbacks" value={String(openRequests)} accent="#eab308" />
      </div>

      <div style={{ marginTop: 16 }}>
        <TagEditor contactId={id} allTags={allTags} tagIds={tagIds} />
      </div>

      <Section title="Notes & activity">
        <NotesPanel contactId={id} activity={activity} timezone={tz} />
      </Section>

      <Section title="Call history">
        {calls.length === 0 ? (
          <Empty text="No calls." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Status</Th>
                <Th>Routed to</Th>
                <Th>Time</Th>
                <Th>Duration</Th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} style={rowBorder}>
                  <Td>
                    <CallStatusBadge call={c} />
                  </Td>
                  <Td>{c.route_target || "—"}</Td>
                  <Td>{formatTime(c.created_at, tz)}</Td>
                  <Td>{formatDuration(c.duration_seconds)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Open requests">
        {requests.length === 0 ? (
          <Empty text="No requests." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Due</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} style={rowBorder}>
                  <Td>{r.title}</Td>
                  <Td>
                    <RequestStatusBadge status={r.status} />
                  </Td>
                  <Td>{formatTime(r.created_at, tz)}</Td>
                  <Td>{formatTime(r.due_at, tz)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Messages">
        <div style={{ ...card, padding: "16px 18px" }}>
          <MessageThread messages={messages} timezone={tz} emptyText="No messages with this client." />
        </div>
      </Section>
    </>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...card, flex: "1 1 140px", padding: "14px 18px" }}>
      <div style={{ color: colors.muted, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? colors.foreground }}>{value}</div>
    </div>
  );
}
