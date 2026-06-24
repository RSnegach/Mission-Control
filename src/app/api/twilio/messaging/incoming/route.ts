import { readTwilioForm, validateTwilioSignature, twiml } from "@/lib/twilio";
import {
  findBusinessByTwilioNumber,
  getSettings,
  findOrCreateContact,
  listRequestsByContact,
  createInboundMessage,
  recordCallEvent,
  armAck,
} from "@/lib/data";
import { sendDueAcks } from "@/lib/ack";
import { ACK_DEBOUNCE_MS } from "@/lib/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/twilio/messaging/incoming
 *
 * Inbound SMS webhook. Records the reply, links it to the caller's open thread,
 * and arms a 30s auto-acknowledgment (debounced: each reply pushes the timer).
 * Returns empty TwiML (we send the ack ourselves via the REST API / sweeper, not
 * inline) so Twilio does not reply synchronously.
 */
export async function POST(req: Request) {
  try {
    const params = await readTwilioForm(req);

    if (!validateTwilioSignature(req, params)) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    const from = params.From ?? "";
    const to = params.To ?? "";
    const body = params.Body ?? "";
    const messageSid = params.MessageSid ?? params.SmsSid ?? "";
    const numMedia = Number.parseInt(params.NumMedia ?? "0", 10) || 0;
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const url = params[`MediaUrl${i}`];
      if (url) mediaUrls.push(url);
    }

    if (!from || !to) return twiml("");

    const business = await findBusinessByTwilioNumber(to);
    if (!business) {
      await recordCallEvent({
        businessId: null,
        callId: null,
        eventType: "incoming-sms-unmatched",
        payload: params,
      });
      return twiml("");
    }

    const contact = await findOrCreateContact(business.id, from);

    // Link to the caller's most relevant thread: an open callback if any, else newest.
    let requestId: string | null = null;
    if (contact) {
      const reqs = await listRequestsByContact(business.id, contact.id, 10);
      const open = reqs.find((r) => r.status === "needs_callback");
      requestId = (open ?? reqs[0])?.id ?? null;
    }

    await createInboundMessage({
      businessId: business.id,
      contactId: contact?.id ?? null,
      requestId,
      fromNumber: from,
      toNumber: to,
      body,
      twilioMessageSid: messageSid || null,
      mediaUrls: mediaUrls.length ? mediaUrls : null,
    });

    await recordCallEvent({
      businessId: business.id,
      callId: null,
      eventType: "incoming-sms",
      payload: params,
    });

    // Arm the debounced ack on the thread (no-op if the thread already acked).
    if (requestId) {
      const settings = await getSettings(business.id);
      if (settings?.ack_enabled) {
        await armAck(business.id, requestId, new Date(Date.now() + ACK_DEBOUNCE_MS).toISOString());
      }
    }

    // Advance any already-due acks now (covers serverless / no timer).
    await sendDueAcks().catch(() => {});

    return twiml("");
  } catch (e) {
    console.error("[twilio/messaging/incoming] handler error", e);
    return twiml("");
  }
}
