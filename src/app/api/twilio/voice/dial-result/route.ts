import { readTwilioForm, validateTwilioSignature, twiml } from "@/lib/twilio";
import {
  getCallBySid,
  updateCallBySid,
  createMissedCallRequest,
  recordCallEvent,
} from "@/lib/data";
import type { Call } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/twilio/voice/dial-result
 *
 * Fired by the <Dial action=...> when the dial attempt finishes. The key field
 * is DialCallStatus: 'completed' | 'no-answer' | 'busy' | 'failed' | 'canceled'.
 *
 * On a missed outcome (no-answer/busy/failed/canceled) we mark the call missed
 * and create a callback request (idempotent). The returned TwiML closes out the
 * call; voicemail recording is added in MVP 2.
 */
const MISSED_STATUSES = new Set(["no-answer", "busy", "failed", "canceled"]);

export async function POST(req: Request) {
  try {
    const params = await readTwilioForm(req);

    if (!validateTwilioSignature(req, params)) {
      return new Response("Invalid Twilio signature", { status: 403 });
    }

    const callSid = params.CallSid ?? "";
    const dialStatus = params.DialCallStatus ?? "";
    const dialDuration = params.DialCallDuration
      ? Number.parseInt(params.DialCallDuration, 10)
      : null;

    const call = callSid ? await getCallBySid(callSid) : null;

    if (call) {
      await recordCallEvent({
        businessId: call.business_id,
        callId: call.id,
        eventType: "dial-result",
        payload: params,
      });
    }

    const missed = MISSED_STATUSES.has(dialStatus);

    if (call) {
      // The action callback fires once, after the dialed leg has ended, and
      // carries no answer timestamp. So now() is the hangup moment. Derive the
      // answer time as end - bridged duration rather than stamping now() (which
      // would make answered_at == ended_at). answerOnBridge makes DialCallDuration
      // the talk time. For an exact answer instant, add a statusCallback later.
      const endedAt = new Date();
      const patch: Partial<Call> = {
        status: missed ? "missed" : "answered",
        outcome: missed ? "missed" : "answered",
        ended_at: endedAt.toISOString(),
      };
      if (!missed && dialDuration !== null) {
        patch.duration_seconds = dialDuration;
        patch.answered_at =
          call.answered_at ??
          new Date(endedAt.getTime() - dialDuration * 1000).toISOString();
      }
      await updateCallBySid(callSid, patch);

      if (missed) {
        await createMissedCallRequest(call);
      }
    }

    if (missed) {
      return twiml(
        `<Say>Sorry, no one was available to take your call. ` +
          `We have logged your call and will follow up shortly. Goodbye.</Say><Hangup/>`,
      );
    }

    // Answered: the bridged call already happened; just hang up the parent.
    return twiml(`<Hangup/>`);
  } catch (err) {
    // Log server-side; hang up cleanly so Twilio does not retry a permanent failure.
    console.error("[twilio/dial-result] handler error", err);
    return twiml(`<Hangup/>`);
  }
}
