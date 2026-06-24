import {
  getPrimaryBusiness,
  listCalls,
  listMissedRequests,
  listRecentMessages,
  getContactsByIds,
} from "@/lib/data";
import { groupMessages } from "@/lib/analytics";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { CallLog } from "@/components/CallLog";
import type { CallView } from "@/components/CallRow";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const business = await getPrimaryBusiness();
  if (!business) {
    return (
      <>
        <PageHeader title="Calls" />
        <Empty text="No business found. Mock seed missing." />
      </>
    );
  }

  const [calls, requests, messages] = await Promise.all([
    listCalls(business.id, 200),
    listMissedRequests(business.id, 200),
    listRecentMessages(business.id, 500),
  ]);

  const contactIds = calls
    .map((c) => c.contact_id)
    .filter((id): id is string => Boolean(id));
  const contacts = await getContactsByIds(business.id, contactIds);

  const { byRequest, byContact } = groupMessages(messages);
  const requestByCall = new Map(requests.map((r) => [r.call_id, r]));

  const views: CallView[] = calls.map((call) => {
    const request =
      requests.find((r) => r.call_id === call.id) ??
      requestByCall.get(call.id) ??
      null;
    // Prefer the request thread; fall back to the contact's messages.
    let msgs = request ? byRequest.get(request.id) ?? [] : [];
    if (msgs.length === 0 && call.contact_id) {
      msgs = byContact.get(call.contact_id) ?? [];
    }
    return {
      call,
      contact: call.contact_id ? contacts.get(call.contact_id) ?? null : null,
      messages: msgs,
      request,
    };
  });

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="Every inbound call. Expand a row to see the text follow-up and timeline."
      />
      <CallLog views={views} timezone={business.timezone} />
    </>
  );
}
