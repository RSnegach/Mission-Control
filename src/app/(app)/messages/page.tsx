import {
  getPrimaryBusiness,
  listRecentMessages,
  getContactsByIds,
} from "@/lib/data";
import { groupMessages } from "@/lib/analytics";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { MessageInbox, type ThreadView } from "@/components/MessageInbox";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const business = await getPrimaryBusiness();
  if (!business) {
    return (
      <>
        <PageHeader title="Messages" />
        <Empty text="No business found. Mock seed missing." />
      </>
    );
  }

  const tz = business.timezone;
  const messages = await listRecentMessages(business.id, 2000);
  const { byContact } = groupMessages(messages);

  const threads = [...byContact.entries()]
    .map(([contactId, msgs]) => ({ contactId, msgs, last: msgs[msgs.length - 1] }))
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));

  const contacts = await getContactsByIds(
    business.id,
    threads.map((t) => t.contactId),
  );

  const views: ThreadView[] = threads.map(({ contactId, msgs, last }) => {
    const contact = contacts.get(contactId);
    return {
      contactId,
      name: contact?.name || contact?.phone || "Unknown caller",
      phone: contact?.phone ?? null,
      msgs,
      last,
      hasReply: msgs.some((m) => m.direction === "inbound"),
      hasOutbound: msgs.some((m) => m.direction === "outbound"),
    };
  });

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={`${threads.length} conversation${threads.length === 1 ? "" : "s"} · search and filter`}
      />
      {threads.length === 0 ? (
        <Empty text="No messages yet." />
      ) : (
        <MessageInbox threads={views} timezone={tz} />
      )}
    </>
  );
}
