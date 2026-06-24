import { isMockMode } from "./backend";
import {
  listDueAckThreads,
  listMessagesByRequest,
  markAckSent,
  getSettings,
  getContactById,
  findBusinessByTwilioNumber,
  createOutboundMessage,
} from "./data";
import { getTwilioClient } from "./twilio";
import { renderTemplate, DEFAULT_ACK_TEMPLATE, ACK_DEBOUNCE_MS } from "./template";
import type { CallRequest } from "./types";

/**
 * Auto-acknowledgment sweeper. After a caller replies, the inbound webhook stamps
 * ack_due_at = now + 30s on the thread's request. This sweep sends the ack once,
 * but only if the caller's LAST inbound is still >= 30s old (a real debounce: a
 * newer reply pushes the last-inbound time forward and defers the ack).
 *
 * Called on a short interval (instrumentation.ts) and opportunistically from the
 * inbound webhook and the Messages page, so it advances with or without the timer.
 */
export async function sendDueAcks(now: Date = new Date()): Promise<{ sent: number }> {
  const due = await listDueAckThreads(now.toISOString(), 100);
  let sent = 0;
  for (const req of due) {
    try {
      if (await sendAckForRequest(req)) sent += 1;
    } catch (e) {
      console.error("[ack] send failed for request", req.id, e);
    }
  }
  return { sent };
}

export async function sendAckForRequest(req: CallRequest): Promise<boolean> {
  if (req.ack_sent_at) return false;

  const settings = await getSettings(req.business_id);
  if (!settings?.ack_enabled) return false;

  const msgs = await listMessagesByRequest(req.business_id, req.id);
  const inbound = msgs.filter((m) => m.direction === "inbound");
  const lastInbound = inbound[inbound.length - 1];
  if (!lastInbound) return false;

  // Debounce: only fire once the latest inbound has been quiet for the window.
  const quietMs = Date.now() - new Date(lastInbound.created_at).getTime();
  if (quietMs < ACK_DEBOUNCE_MS) return false;

  // Atomic claim: only one sweep proceeds even if several overlap.
  const claimed = await markAckSent(req.business_id, req.id, new Date().toISOString());
  if (!claimed) return false;

  // The inbound's "to" is our Twilio number; "from" is the caller.
  const from = lastInbound.to_number;
  const to = lastInbound.from_number;
  if (!from || !to) {
    console.error("[ack] missing numbers on thread", req.id);
    return false; // already claimed; do not retry-loop a permanent gap
  }

  const business = await findBusinessByTwilioNumber(from);
  if (!business) {
    console.error("[ack] no business for number", from);
    return false;
  }

  let name = "there";
  if (req.contact_id) {
    const contact = await getContactById(req.business_id, req.contact_id);
    const trimmed = contact?.name?.trim();
    if (trimmed) name = trimmed;
  }

  const body = renderTemplate(settings.ack_template || DEFAULT_ACK_TEMPLATE, {
    business: business.name,
    name,
  });

  let twilioMessageSid: string | null = null;
  if (!isMockMode()) {
    const res = await getTwilioClient().messages.create({ from, to, body });
    twilioMessageSid = res.sid;
  }

  await createOutboundMessage({
    businessId: req.business_id,
    contactId: req.contact_id,
    requestId: req.id,
    fromNumber: from,
    toNumber: to,
    body,
    status: isMockMode() ? "sent" : "queued",
    twilioMessageSid,
  });

  return true;
}
