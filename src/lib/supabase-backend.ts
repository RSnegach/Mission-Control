import { getAdminClient } from "./supabase";
import { toE164 } from "./phone";
import type { DataBackend } from "./backend";
import type { Business, BusinessSettings, Call, CallRequest, Contact, Message } from "./types";

/**
 * Real backend: Postgres via supabase-js. Used when MOCK_MODE !== "true".
 * Logic is unchanged from the original data layer; it just lives behind the
 * DataBackend interface now so the mock can stand in for it.
 */
export class SupabaseBackend implements DataBackend {
  async findBusinessByTwilioNumber(toNumber: string): Promise<Business | null> {
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

  async getSettings(businessId: string): Promise<BusinessSettings | null> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("business_settings")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle();
    if (error) throw error;
    return data as BusinessSettings | null;
  }

  async findOrCreateContact(
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

  async createIncomingCall(params: {
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

  async updateCallBySid(
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

  async getCallBySid(callSid: string): Promise<Call | null> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("calls")
      .select("*")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();
    if (error) throw error;
    return (data as Call) ?? null;
  }

  async createMissedCallRequest(call: Call): Promise<CallRequest | null> {
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
    const settings = await this.getSettings(call.business_id);
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

  async recordCallEvent(params: {
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

  async listCalls(businessId: string, limit = 100): Promise<Call[]> {
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

  async listMissedRequests(businessId: string, limit = 100): Promise<CallRequest[]> {
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

  async getPrimaryBusiness(): Promise<Business | null> {
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

  async getContactsByIds(
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

  // --- Messages --- (requires a `messages` table; added in a later MVP migration)
  async listMessagesByContact(businessId: string, contactId: string, limit = 200): Promise<Message[]> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("messages")
      .select("*")
      .eq("business_id", businessId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Message[];
  }

  async listMessagesByRequest(businessId: string, requestId: string): Promise<Message[]> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("messages")
      .select("*")
      .eq("business_id", businessId)
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Message[];
  }

  async listMessagesByCall(businessId: string, callId: string): Promise<Message[]> {
    const call = await this.getCallById(businessId, callId);
    if (!call) return [];
    if (call.created_request_id) {
      const byReq = await this.listMessagesByRequest(businessId, call.created_request_id);
      if (byReq.length) return byReq;
    }
    if (call.contact_id) return this.listMessagesByContact(businessId, call.contact_id);
    return [];
  }

  async listRecentMessages(businessId: string, limit = 200): Promise<Message[]> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("messages")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Message[];
  }

  // --- Contacts / clients ---
  async getContactById(businessId: string, contactId: string): Promise<Contact | null> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("contacts")
      .select("*")
      .eq("business_id", businessId)
      .eq("id", contactId)
      .maybeSingle();
    if (error) throw error;
    return (data as Contact) ?? null;
  }

  async listContacts(businessId: string, limit = 200): Promise<Contact[]> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("contacts")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Contact[];
  }

  // --- Per-contact history ---
  async listCallsByContact(businessId: string, contactId: string, limit = 100): Promise<Call[]> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("calls")
      .select("*")
      .eq("business_id", businessId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Call[];
  }

  async listRequestsByContact(businessId: string, contactId: string, limit = 100): Promise<CallRequest[]> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("requests")
      .select("*")
      .eq("business_id", businessId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as CallRequest[];
  }

  // Internal: fetch a single call by id (used by listMessagesByCall).
  private async getCallById(businessId: string, callId: string): Promise<Call | null> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("calls")
      .select("*")
      .eq("business_id", businessId)
      .eq("id", callId)
      .maybeSingle();
    if (error) throw error;
    return (data as Call) ?? null;
  }

  // --- Writes ---
  async updateSettings(
    businessId: string,
    patch: Partial<
      Pick<
        BusinessSettings,
        "default_route_phone" | "sms_followup_enabled" | "sms_followup_template"
      >
    >,
  ): Promise<BusinessSettings | null> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("business_settings")
      .update(patch)
      .eq("business_id", businessId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return (data as BusinessSettings) ?? null;
  }

  async createOutboundMessage(params: {
    businessId: string;
    contactId: string | null;
    requestId: string | null;
    fromNumber: string;
    toNumber: string;
    body: string;
    status?: string;
    twilioMessageSid?: string | null;
  }): Promise<Message> {
    // Requires the `messages` table (real-mode follow-on migration).
    const db = getAdminClient();
    const { data, error } = await db
      .from("messages")
      .insert({
        business_id: params.businessId,
        contact_id: params.contactId,
        request_id: params.requestId,
        twilio_message_sid: params.twilioMessageSid ?? null,
        direction: "outbound",
        from_number: params.fromNumber,
        to_number: params.toNumber,
        body: params.body,
        status: params.status ?? "sent",
        media_urls: null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as Message;
  }

  async updateContactName(
    businessId: string,
    contactId: string,
    name: string | null,
  ): Promise<Contact | null> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("contacts")
      .update({ name })
      .eq("business_id", businessId)
      .eq("id", contactId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return (data as Contact) ?? null;
  }
}
