import { getAdminClient } from "./supabase";
import { toE164 } from "./phone";
import type { Business, BusinessSettings, Call, CallRequest, Contact } from "./types";

/**
 * Tenant + call data helpers. Every function is server-side and scoped by
 * business_id once the business is resolved from the dialed number.
 */

/** Resolve a business by the Twilio "To" number (the number that was called). */
export async function findBusinessByTwilioNumber(
  toNumber: string,
): Promise<Business | null> {
  const normalized = toE164(toNumber);
  if (!normalized) return null;

  const db = getAdminClient();
  const { data, error } = await db
    .from("twilio_numbers")
    .select("business_id, businesses(*)")
    .eq("phone_number", normalized)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!data || !data.businesses) return null;
  // businesses(*) joins as an object for a to-one relation.
  return data.businesses as unknown as Business;
}

export async function getSettings(businessId: string): Promise<BusinessSettings | null> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("business_settings")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data as BusinessSettings | null;
}

/**
 * Find a contact by phone within a business, creating one if absent.
 * Relies on the unique (business_id, phone) constraint for idempotency: a race
 * that loses the insert falls back to selecting the existing row.
 */
export async function findOrCreateContact(
  businessId: string,
  fromNumber: string,
): Promise<Contact | null> {
  const normalized = toE164(fromNumber);
  if (!normalized) return null;

  const db = getAdminClient();

  const existing = await db
    .from("contacts")
    .select("*")
    .eq("business_id", businessId)
    .eq("phone", normalized)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as Contact;

  const insert = await db
    .from("contacts")
    .insert({ business_id: businessId, phone: normalized })
    .select("*")
    .single();

  if (insert.error) {
    // Unique violation => another request created it first; re-select.
    if (insert.error.code === "23505") {
      const retry = await db
        .from("contacts")
        .select("*")
        .eq("business_id", businessId)
        .eq("phone", normalized)
        .single();
      if (retry.error) throw retry.error;
      return retry.data as Contact;
    }
    throw insert.error;
  }
  return insert.data as Contact;
}

/**
 * Create the call row for an inbound webhook, or return the existing row if the
 * same CallSid arrives twice (Twilio retries). Idempotent on twilio_call_sid.
 */
export async function createIncomingCall(params: {
  businessId: string;
  callSid: string;
  fromNumber: string;
  toNumber: string;
  contactId: string | null;
}): Promise<Call> {
  const db = getAdminClient();

  const insert = await db
    .from("calls")
    .insert({
      business_id: params.businessId,
      twilio_call_sid: params.callSid,
      from_number: params.fromNumber,
      to_number: params.toNumber,
      contact_id: params.contactId,
      direction: "inbound",
      status: "incoming",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insert.error) {
    if (insert.error.code === "23505") {
      const existing = await db
        .from("calls")
        .select("*")
        .eq("twilio_call_sid", params.callSid)
        .single();
      if (existing.error) throw existing.error;
      const row = existing.data as Call;
      // CallSid is globally unique, so a collision normally means the same call
      // arrived twice. Assert tenant ownership anyway: a forged/reused CallSid
      // pointed at another business's number must not return that business's row.
      if (row.business_id !== params.businessId) {
        throw new Error(
          `CallSid ${params.callSid} already belongs to a different business`,
        );
      }
      return row;
    }
    throw insert.error;
  }
  return insert.data as Call;
}

/** Patch a call identified by its Twilio CallSid. Returns the updated row, or null if unknown. */
export async function updateCallBySid(
  callSid: string,
  patch: Partial<Omit<Call, "id" | "business_id" | "twilio_call_sid" | "created_at">>,
): Promise<Call | null> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("calls")
    .update(patch)
    .eq("twilio_call_sid", callSid)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as Call) ?? null;
}

export async function getCallBySid(callSid: string): Promise<Call | null> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("calls")
    .select("*")
    .eq("twilio_call_sid", callSid)
    .maybeSingle();
  if (error) throw error;
  return (data as Call) ?? null;
}

/** Create a callback request for a missed call. Idempotent per call_id. */
export async function createMissedCallRequest(call: Call): Promise<CallRequest | null> {
  const db = getAdminClient();

  // Avoid duplicates if dial-result is retried. order+limit+maybeSingle returns
  // at most one row even if duplicates somehow already exist, so this read never
  // throws PGRST116 ("multiple rows returned") and traps the handler in a retry loop.
  const dedupQuery = () =>
    db
      .from("requests")
      .select("*")
      .eq("business_id", call.business_id)
      .eq("call_id", call.id)
      .eq("source", "call")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  const existing = await dedupQuery();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as CallRequest;

  // Due time = now + callback SLA (business setting; default 60 min).
  const settings = await getSettings(call.business_id);
  const slaMinutes = settings?.callback_sla_minutes ?? 60;
  const dueAt = new Date(Date.now() + slaMinutes * 60_000).toISOString();

  const insert = await db
    .from("requests")
    .insert({
      business_id: call.business_id,
      contact_id: call.contact_id,
      call_id: call.id,
      title: "Missed call callback",
      status: "needs_callback",
      priority: "normal",
      source: "call",
      due_at: dueAt,
    })
    .select("*")
    .single();

  if (insert.error) {
    // Concurrent retry won the race; the partial unique index rejects this insert.
    // Re-select and return the row the other call created.
    if (insert.error.code === "23505") {
      const retry = await dedupQuery();
      if (retry.error) throw retry.error;
      if (retry.data) return retry.data as CallRequest;
    }
    throw insert.error;
  }

  // Best-effort back-link onto the call for the dashboard. The request already
  // exists; a failed link must not fail the missed-call flow (which would make
  // Twilio retry). Log it instead.
  const link = await db
    .from("calls")
    .update({ created_request_id: insert.data.id })
    .eq("id", call.id);
  if (link.error) {
    console.error("[data] failed to link created_request_id", {
      callId: call.id,
      requestId: insert.data.id,
      error: link.error,
    });
  }

  return insert.data as CallRequest;
}

/** Append a raw webhook payload for debugging/audit (brief section 20). */
export async function recordCallEvent(params: {
  businessId: string | null;
  callId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const db = getAdminClient();
  const { error } = await db.from("call_events").insert({
    business_id: params.businessId,
    call_id: params.callId,
    event_type: params.eventType,
    payload_json: params.payload,
  });
  if (error) throw error;
}

// ---- Dashboard reads -------------------------------------------------------

export async function listCalls(businessId: string, limit = 100): Promise<Call[]> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("calls")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Call[];
}

export async function listMissedRequests(businessId: string, limit = 100): Promise<CallRequest[]> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("requests")
    .select("*")
    .eq("business_id", businessId)
    .eq("status", "needs_callback")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CallRequest[];
}

export async function getPrimaryBusiness(): Promise<Business | null> {
  // MVP 1: the dashboard shows the single seeded business (oldest one).
  const db = getAdminClient();
  const { data, error } = await db
    .from("businesses")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Business) ?? null;
}

export async function getContactsByIds(
  businessId: string,
  ids: string[],
): Promise<Map<string, Contact>> {
  const map = new Map<string, Contact>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;

  const db = getAdminClient();
  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("business_id", businessId)
    .in("id", unique);
  if (error) throw error;
  for (const c of (data ?? []) as Contact[]) map.set(c.id, c);
  return map;
}
