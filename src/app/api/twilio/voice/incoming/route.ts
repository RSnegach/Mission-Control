import {
  readTwilioForm,
  validateTwilioSignature,
  twiml,
  xmlEscape,
} from "@/lib/twilio";
import {
  findBusinessByTwilioNumber,
  getSettings,
  findOrCreateContact,
  createIncomingCall,
  updateCallBySid,
  recordCallEvent,
} from "@/lib/data";

// Twilio sends form-encoded POSTs. Force this route to run on the Node runtime
// (the twilio SDK validation uses Node crypto) and never be statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/twilio/voice/incoming
 *
 * 1. Validate signature.
 * 2. Map "To" -> business.
 * 3. Find/create contact by "From".
 * 4. Create the call row (idempotent on CallSid).
 * 5. Return TwiML that dials the business default route phone, with a
 *    dial-result action so we learn whether it was answered.
 */
// Generic message used for every "cannot connect you" outcome (unknown number,
// no route configured, internal error). Kept identical across paths so an
// outside caller cannot tell a provisioned number from an unprovisioned one.
const UNAVAILABLE_TWIML = `<Say>Sorry, we cannot take your call right now. Goodbye.</Say><Hangup/>`;

export async function POST(req: Request) {
  try {
    const params = await readTwilioForm(req);

    if (!validateTwilioSignature(req, params)) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    const to = params.To ?? "";
    const from = params.From ?? "";
    const callSid = params.CallSid ?? "";

    if (!to || !from || !callSid) {
      return twiml(UNAVAILABLE_TWIML);
    }

    const business = await findBusinessByTwilioNumber(to);
    if (!business) {
      // Unknown number. Log for debugging; respond with the same generic
      // message a configured-but-unrouted number returns (no enumeration oracle).
      await recordCallEvent({
        businessId: null,
        callId: null,
        eventType: "incoming-unmatched",
        payload: params,
      });
      return twiml(UNAVAILABLE_TWIML);
    }

    const contact = await findOrCreateContact(business.id, from);

    const call = await createIncomingCall({
      businessId: business.id,
      callSid,
      fromNumber: from,
      toNumber: to,
      contactId: contact?.id ?? null,
    });

    await recordCallEvent({
      businessId: business.id,
      callId: call.id,
      eventType: "incoming",
      payload: params,
    });

    const settings = await getSettings(business.id);
    const routePhone = settings?.default_route_phone ?? null;
    const timeout = settings?.dial_timeout_seconds ?? 20;

    if (!routePhone) {
      // No route configured. Voicemail arrives in MVP 2. Same generic message.
      return twiml(UNAVAILABLE_TWIML);
    }

    // Record the target on the call so the dashboard shows where it was routed.
    await updateCallBySid(callSid, { route_target: routePhone, status: "routing" });

    const action = "/api/twilio/voice/dial-result";
    return twiml(
      `<Say>Thanks for calling ${xmlEscape(business.name)}. Please hold while we connect you.</Say>` +
        `<Dial timeout="${timeout}" action="${action}" method="POST" answerOnBridge="true">` +
        `<Number>${xmlEscape(routePhone)}</Number>` +
        `</Dial>`,
    );
  } catch (err) {
    // Never return a 500 to Twilio: it would retry the same permanent failure
    // and the caller would hear a generic carrier error. Log server-side and
    // hang up cleanly. Raw error detail stays in our logs, not the response.
    console.error("[twilio/incoming] handler error", err);
    return twiml(UNAVAILABLE_TWIML);
  }
}
