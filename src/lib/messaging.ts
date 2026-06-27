import { isMockMode } from "./backend";
import { getContactById, createOutboundMessage } from "./data";
import { getTwilioClient } from "./twilio";
import type { Business } from "./types";

/**
 * Send an ad-hoc SMS to a contact and persist it as an outbound message. Mirrors
 * the followup/ack gate: real Twilio send only when not in mock mode, otherwise
 * just records the row so the thread updates. Does NOT arm an ack (the owner is
 * the one initiating contact here).
 *
 * Returns the persisted message id, or null if the contact has no phone.
 */
export async function sendSmsToContact(
  business: Business,
  contactId: string,
  fromNumber: string,
  body: string,
): Promise<string | null> {
  const contact = await getContactById(business.id, contactId);
  const to = contact?.phone ?? null;
  if (!to) return null;

  let twilioMessageSid: string | null = null;
  if (!isMockMode()) {
    const sent = await getTwilioClient().messages.create({ from: fromNumber, to, body });
    twilioMessageSid = sent.sid;
  }

  const msg = await createOutboundMessage({
    businessId: business.id,
    contactId,
    requestId: null,
    fromNumber,
    toNumber: to,
    body,
    status: isMockMode() ? "sent" : "queued",
    twilioMessageSid,
  });
  return msg.id;
}
