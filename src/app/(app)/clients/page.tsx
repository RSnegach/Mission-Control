import Link from "next/link";
import {
  getPrimaryBusiness,
  listContacts,
  listCalls,
  listRecentMessages,
} from "@/lib/data";
import { formatTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { Table, Th, Td } from "@/components/Table";
import { colors, rowBorder } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const business = await getPrimaryBusiness();
  if (!business) {
    return (
      <>
        <PageHeader title="Clients" />
        <Empty text="No business found. Mock seed missing." />
      </>
    );
  }

  const tz = business.timezone;
  const [contacts, calls, messages] = await Promise.all([
    listContacts(business.id, 500),
    listCalls(business.id, 1000),
    listRecentMessages(business.id, 1000),
  ]);

  // Per-contact counts for the list.
  const callCount = new Map<string, number>();
  const lastCallAt = new Map<string, string>();
  for (const c of calls) {
    if (!c.contact_id) continue;
    callCount.set(c.contact_id, (callCount.get(c.contact_id) ?? 0) + 1);
    if (!lastCallAt.has(c.contact_id)) lastCallAt.set(c.contact_id, c.created_at); // calls are DESC
  }
  const msgCount = new Map<string, number>();
  for (const m of messages) {
    if (!m.contact_id) continue;
    msgCount.set(m.contact_id, (msgCount.get(m.contact_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${contacts.length} contact${contacts.length === 1 ? "" : "s"} · every caller becomes a client record`}
      />

      {contacts.length === 0 ? (
        <Empty text="No clients yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th align="right">Calls</Th>
              <Th align="right">Messages</Th>
              <Th>Last call</Th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} style={rowBorder}>
                <Td>
                  <Link href={`/clients/${c.id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                    {c.name || "Unnamed caller"}
                  </Link>
                </Td>
                <Td>
                  <span style={{ color: colors.muted }}>{c.phone || "—"}</span>
                </Td>
                <Td align="right">{callCount.get(c.id) ?? 0}</Td>
                <Td align="right">{msgCount.get(c.id) ?? 0}</Td>
                <Td>{lastCallAt.has(c.id) ? formatTime(lastCallAt.get(c.id)!, tz) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
