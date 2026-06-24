import { isMockMode } from "./backend";
import {
  getContactById,
  createOutboundMessage,
  listMessagesByRequest,
} from "./data";
import { getTwilioClient } from "./twilio";
import { renderTemplate, DEFAULT_FOLLOWUP_TEMPLATE } from "./template";
import type { Business, BusinessSettings, Call } from "./types";

/**
 * Send the missed-call SMS follow-up.
 *
 * Server-only. In mock mode this only persists an outbound message row; in real
 * mode it also sends via the Twilio REST API. Safe to call more than once for
 * the same call: it checks for an existing outbound message on the linked
 * request and does not resend (covers Twilio webhook retries).
 *
 * Returns whether a message was sent, and if not, why (for logging).
 */
export async function sendMissedCallFollowup(
  call: Call,
  business: Business,
  settings: BusinessSettings | null,
): Promise<{ sent: boolean; reason?: string }> {
  if (!settings?.sms_followup_enabled) {
    return { sent: false, reason: "disabled" };
  }

  const from = call.to_number; // the business's own Twilio number
  const to = call.from_number; // the caller
  if (!from || !to) {
    return { sent: false, reason: "missing-number" };
  }

  // Idempotency: if we already texted for this request, do not resend.
  if (call.created_request_id) {
    const existing = await listMessagesByRequest(business.id, call.created_request_id);
    if (existing.some((m) => m.direction === "outbound")) {
      return { sent: false, reason: "already-sent" };
    }
  }

  // Resolve the caller's name; fall back to "there" when unknown.
  let name = "there";
  if (call.contact_id) {
    const contact = await getContactById(business.id, call.contact_id);
    const trimmed = contact?.name?.trim();
    if (trimmed) name = trimmed;
  }

  const template = settings.sms_followup_template || DEFAULT_FOLLOWUP_TEMPLATE;
  const body = renderTemplate(template, { business: business.name, name });

  // Real mode: hand off to Twilio. Mock mode: skip the network entirely.
  let twilioMessageSid: string | null = null;
  if (!isMockMode()) {
    const sent = await getTwilioClient().messages.create({ from, to, body });
    twilioMessageSid = sent.sid;
  }

  await createOutboundMessage({
    businessId: business.id,
    contactId: call.contact_id,
    requestId: call.created_request_id,
    fromNumber: from,
    toNumber: to,
    body,
    status: isMockMode() ? "sent" : "queued",
    twilioMessageSid,
  });

  return { sent: true };
}
