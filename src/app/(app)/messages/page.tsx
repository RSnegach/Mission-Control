import Link from "next/link";
import {
  getPrimaryBusiness,
  listRecentMessages,
  getContactsByIds,
} from "@/lib/data";
import { groupMessages } from "@/lib/analytics";
import { formatTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { MessageThread } from "@/components/MessageThread";
import { colors, card } from "@/components/ui";

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
  const messages = await listRecentMessages(business.id, 500);
  const { byContact } = groupMessages(messages);

  // Order threads by most recent message. byContact threads are ascending,
  // so the last element is the newest.
  const threads = [...byContact.entries()]
    .map(([contactId, msgs]) => ({ contactId, msgs, last: msgs[msgs.length - 1] }))
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));

  const contactIds = threads.map((t) => t.contactId);
  const contacts = await getContactsByIds(business.id, contactIds);

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={`${threads.length} conversation${threads.length === 1 ? "" : "s"}`}
      />

      {threads.length === 0 ? (
        <Empty text="No messages yet." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {threads.map(({ contactId, msgs, last }) => {
            const contact = contacts.get(contactId);
            const name = contact?.name || contact?.phone || "Unknown caller";
            return (
              <div key={contactId} style={{ ...card, padding: "16px 18px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 12,
                  }}
                >
                  <Link
                    href={`/clients/${contactId}`}
                    style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600, fontSize: 15 }}
                  >
                    {name}
                  </Link>
                  <span style={{ color: colors.muted, fontSize: 12 }}>
                    {formatTime(last.created_at, tz)}
                  </span>
                </div>
                <MessageThread messages={msgs} timezone={tz} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
