import {
  getPrimaryBusiness,
  listContacts,
  listCalls,
  listRecentMessages,
  listMissedRequests,
} from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { ClientTable, type ClientView } from "@/components/ClientTable";

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

  // Pull the full interaction history once and fold it per contact.
  const [contacts, calls, messages, openReqs] = await Promise.all([
    listContacts(business.id, 1000),
    listCalls(business.id, 2000),
    listRecentMessages(business.id, 2000),
    listMissedRequests(business.id, 1000),
  ]);

  const callCount = new Map<string, number>();
  const lastCallAt = new Map<string, string>();
  for (const c of calls) {
    if (!c.contact_id) continue;
    callCount.set(c.contact_id, (callCount.get(c.contact_id) ?? 0) + 1);
    // calls arrive newest-first, so the first seen is the latest.
    if (!lastCallAt.has(c.contact_id)) lastCallAt.set(c.contact_id, c.created_at);
  }

  const msgCount = new Map<string, number>();
  const lastMsgAt = new Map<string, string>();
  for (const m of messages) {
    if (!m.contact_id) continue;
    msgCount.set(m.contact_id, (msgCount.get(m.contact_id) ?? 0) + 1);
    if (!lastMsgAt.has(m.contact_id)) lastMsgAt.set(m.contact_id, m.created_at);
  }

  const openByContact = new Map<string, number>();
  for (const r of openReqs) {
    if (!r.contact_id) continue;
    openByContact.set(r.contact_id, (openByContact.get(r.contact_id) ?? 0) + 1);
  }

  const clients: ClientView[] = contacts.map((c) => {
    const lc = lastCallAt.get(c.id) ?? null;
    const lm = lastMsgAt.get(c.id) ?? null;
    const last = [lc, lm].filter(Boolean).sort().slice(-1)[0] ?? null; // max ISO
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      callCount: callCount.get(c.id) ?? 0,
      messageCount: msgCount.get(c.id) ?? 0,
      openRequests: openByContact.get(c.id) ?? 0,
      lastInteractionAt: last,
      firstSeenAt: c.created_at,
    };
  });

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${contacts.length} client${contacts.length === 1 ? "" : "s"} ever contacted · search and sort the full history`}
      />
      {contacts.length === 0 ? (
        <Empty text="No clients yet." />
      ) : (
        <ClientTable clients={clients} timezone={business.timezone} />
      )}
    </>
  );
}
