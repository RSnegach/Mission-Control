import { isMockMode } from "./backend";
import {
  listDueReminders,
  markReminderSent,
  getContactById,
  getBusinessFromNumber,
  findBusinessByTwilioNumber,
  createOutboundMessage,
} from "./data";
import { getTwilioClient } from "./twilio";

/**
 * Scheduled-callback reminder sweeper. When a request has a scheduled_for time
 * that has arrived and no reminder yet, text the caller a heads-up. Fire-once via
 * markReminderSent (atomic claim). Mirrors the ack sweeper; real send only outside
 * mock mode.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const due = await listDueReminders(now.toISOString(), 100);
  let sent = 0;
  for (const req of due) {
    try {
      if (await sendReminderForRequest(req.business_id, req.id, req.contact_id)) sent += 1;
    } catch (e) {
      console.error("[reminders] send failed for request", req.id, e);
    }
  }
  return { sent };
}

async function sendReminderForRequest(
  businessId: string,
  requestId: string,
  contactId: string | null,
): Promise<boolean> {
  // Atomic claim so overlapping sweeps fire only one reminder.
  const claimed = await markReminderSent(businessId, requestId, new Date().toISOString());
  if (!claimed) return false;

  if (!contactId) return false;
  const contact = await getContactById(businessId, contactId);
  const to = contact?.phone ?? null;
  const from = await getBusinessFromNumber(businessId);
  if (!to || !from) return false;

  const business = await findBusinessByTwilioNumber(from);
  const name = contact?.name?.trim() || "there";
  const bizName = business?.name ?? "us";
  const body = `Hi ${name}, this is a reminder from ${bizName} about your scheduled callback. We'll be in touch shortly.`;

  let twilioMessageSid: string | null = null;
  if (!isMockMode()) {
    const sent = await getTwilioClient().messages.create({ from, to, body });
    twilioMessageSid = sent.sid;
  }
  await createOutboundMessage({
    businessId,
    contactId,
    requestId,
    fromNumber: from,
    toNumber: to,
    body,
    status: isMockMode() ? "sent" : "queued",
    twilioMessageSid,
  });
  return true;
}
