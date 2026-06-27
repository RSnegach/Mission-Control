import { getAdminClient } from "./supabase";
import { toE164 } from "./phone";
import type { DataBackend, RequestPatch } from "./backend";
import type {
  Activity,
  Business,
  BusinessSettings,
  Call,
  CallRequest,
  Contact,
  Message,
  Tag,
  Task,
} from "./types";

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
        | "default_route_phone"
        | "sms_followup_enabled"
        | "sms_followup_template"
        | "ack_enabled"
        | "ack_template"
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

  async createInboundMessage(params: {
    businessId: string;
    contactId: string | null;
    requestId: string | null;
    fromNumber: string;
    toNumber: string;
    body: string;
    status?: string;
    twilioMessageSid?: string | null;
    mediaUrls?: string[] | null;
  }): Promise<Message> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("messages")
      .insert({
        business_id: params.businessId,
        contact_id: params.contactId,
        request_id: params.requestId,
        twilio_message_sid: params.twilioMessageSid ?? null,
        direction: "inbound",
        from_number: params.fromNumber,
        to_number: params.toNumber,
        body: params.body,
        status: params.status ?? "received",
        media_urls: params.mediaUrls ?? null,
      })
      .select("*")
      .single();
    if (error) {
      // Duplicate MessageSid; return the existing row.
      if (error.code === "23505" && params.twilioMessageSid) {
        const existing = await db
          .from("messages")
          .select("*")
          .eq("twilio_message_sid", params.twilioMessageSid)
          .single();
        if (existing.error) throw existing.error;
        return existing.data as Message;
      }
      throw error;
    }
    return data as Message;
  }

  async listDueAckThreads(now: string, limit = 100): Promise<CallRequest[]> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("requests")
      .select("*")
      .not("ack_due_at", "is", null)
      .is("ack_sent_at", null)
      .lte("ack_due_at", now)
      .order("ack_due_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as CallRequest[];
  }

  async armAck(businessId: string, requestId: string, dueAt: string): Promise<void> {
    const db = getAdminClient();
    const { error } = await db
      .from("requests")
      .update({ ack_due_at: dueAt })
      .eq("business_id", businessId)
      .eq("id", requestId)
      .is("ack_sent_at", null);
    if (error) throw error;
  }

  async markAckSent(businessId: string, requestId: string, sentAt: string): Promise<boolean> {
    const db = getAdminClient();
    const { data, error } = await db
      .from("requests")
      .update({ ack_sent_at: sentAt, ack_due_at: null })
      .eq("business_id", businessId)
      .eq("id", requestId)
      .is("ack_sent_at", null)
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  // --- Requests: triage, create, schedule ---
  async getRequestById(businessId: string, requestId: string): Promise<CallRequest | null> {
    const db = getAdminClient();
    const { data, error } = await db.from("requests").select("*").eq("business_id", businessId).eq("id", requestId).maybeSingle();
    if (error) throw error;
    return (data as CallRequest) ?? null;
  }

  async listRequests(businessId: string, limit = 500): Promise<CallRequest[]> {
    const db = getAdminClient();
    const { data, error } = await db.from("requests").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as CallRequest[];
  }

  async updateRequest(businessId: string, requestId: string, patch: RequestPatch): Promise<CallRequest | null> {
    const db = getAdminClient();
    const { data, error } = await db.from("requests").update(patch).eq("business_id", businessId).eq("id", requestId).select("*").maybeSingle();
    if (error) throw error;
    return (data as CallRequest) ?? null;
  }

  async createRequest(params: {
    businessId: string; contactId: string | null; title: string;
    priority?: string; dueAt?: string | null; description?: string | null; source?: string;
  }): Promise<CallRequest> {
    const db = getAdminClient();
    const { data, error } = await db.from("requests").insert({
      business_id: params.businessId,
      contact_id: params.contactId,
      title: params.title,
      priority: params.priority ?? "normal",
      status: "needs_callback",
      due_at: params.dueAt ?? null,
      description: params.description ?? null,
      source: params.source ?? "manual",
    }).select("*").single();
    if (error) throw error;
    return data as CallRequest;
  }

  async listDueReminders(now: string, limit = 100): Promise<CallRequest[]> {
    const db = getAdminClient();
    const { data, error } = await db.from("requests").select("*")
      .not("scheduled_for", "is", null).is("reminder_sent_at", null)
      .lte("scheduled_for", now)
      .not("status", "in", "(completed,cancelled)")
      .order("scheduled_for", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []) as CallRequest[];
  }

  async markReminderSent(businessId: string, requestId: string, sentAt: string): Promise<boolean> {
    const db = getAdminClient();
    const { data, error } = await db.from("requests").update({ reminder_sent_at: sentAt })
      .eq("business_id", businessId).eq("id", requestId).is("reminder_sent_at", null).select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async getBusinessFromNumber(businessId: string): Promise<string | null> {
    const db = getAdminClient();
    const { data, error } = await db.from("twilio_numbers").select("phone_number").eq("business_id", businessId).eq("status", "active").limit(1).maybeSingle();
    if (error) throw error;
    return (data?.phone_number as string) ?? null;
  }

  // --- Contacts: create ---
  async createContact(params: {
    businessId: string; name?: string | null; phone?: string | null; email?: string | null;
  }): Promise<Contact> {
    const db = getAdminClient();
    const normalized = params.phone ? toE164(params.phone) : null;
    if (normalized) {
      const existing = await db.from("contacts").select("*").eq("business_id", params.businessId).eq("phone", normalized).maybeSingle();
      if (existing.data) return existing.data as Contact;
    }
    const { data, error } = await db.from("contacts").insert({
      business_id: params.businessId,
      name: params.name?.trim() || null,
      phone: normalized,
      email: params.email?.trim() || null,
    }).select("*").single();
    if (error) {
      if (error.code === "23505" && normalized) {
        const retry = await db.from("contacts").select("*").eq("business_id", params.businessId).eq("phone", normalized).single();
        if (retry.error) throw retry.error;
        return retry.data as Contact;
      }
      throw error;
    }
    return data as Contact;
  }

  // --- Activity / notes ---
  async createActivity(params: {
    businessId: string; contactId?: string | null; requestId?: string | null;
    kind: string; body: string; createdBy?: string | null;
  }): Promise<Activity> {
    const db = getAdminClient();
    const { data, error } = await db.from("activity").insert({
      business_id: params.businessId,
      contact_id: params.contactId ?? null,
      request_id: params.requestId ?? null,
      kind: params.kind,
      body: params.body,
      created_by: params.createdBy ?? null,
    }).select("*").single();
    if (error) throw error;
    return data as Activity;
  }

  async listActivityByContact(businessId: string, contactId: string, limit = 200): Promise<Activity[]> {
    const db = getAdminClient();
    const { data, error } = await db.from("activity").select("*").eq("business_id", businessId).eq("contact_id", contactId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as Activity[];
  }

  async listActivityByRequest(businessId: string, requestId: string, limit = 200): Promise<Activity[]> {
    const db = getAdminClient();
    const { data, error } = await db.from("activity").select("*").eq("business_id", businessId).eq("request_id", requestId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as Activity[];
  }

  // --- Tags ---
  async listTags(businessId: string): Promise<Tag[]> {
    const db = getAdminClient();
    const { data, error } = await db.from("tags").select("*").eq("business_id", businessId).order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Tag[];
  }

  async createTag(businessId: string, name: string, color: string): Promise<Tag> {
    const db = getAdminClient();
    const { data, error } = await db.from("tags").insert({ business_id: businessId, name, color }).select("*").single();
    if (error) {
      if (error.code === "23505") {
        const retry = await db.from("tags").select("*").eq("business_id", businessId).eq("name", name).single();
        if (retry.error) throw retry.error;
        return retry.data as Tag;
      }
      throw error;
    }
    return data as Tag;
  }

  async addTagToContact(_businessId: string, contactId: string, tagId: string): Promise<void> {
    const db = getAdminClient();
    const { error } = await db.from("contact_tags").upsert({ contact_id: contactId, tag_id: tagId });
    if (error) throw error;
  }

  async removeTagFromContact(_businessId: string, contactId: string, tagId: string): Promise<void> {
    const db = getAdminClient();
    const { error } = await db.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId);
    if (error) throw error;
  }

  async listTagsForContacts(businessId: string, contactIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    const unique = [...new Set(contactIds.filter(Boolean))];
    if (unique.length === 0) return map;
    const db = getAdminClient();
    // Scope by tag.business_id via an inner join filter.
    const { data, error } = await db
      .from("contact_tags")
      .select("contact_id, tag_id, tags!inner(business_id)")
      .in("contact_id", unique)
      .eq("tags.business_id", businessId);
    if (error) throw error;
    for (const row of (data ?? []) as { contact_id: string; tag_id: string }[]) {
      const arr = map.get(row.contact_id) ?? [];
      arr.push(row.tag_id);
      map.set(row.contact_id, arr);
    }
    return map;
  }

  // --- Tasks ---
  async createTask(params: {
    businessId: string; title: string; description?: string | null; priority?: string; dueAt?: string | null;
  }): Promise<Task> {
    const db = getAdminClient();
    const { data, error } = await db.from("tasks").insert({
      business_id: params.businessId,
      title: params.title,
      description: params.description ?? null,
      priority: params.priority ?? "normal",
      status: "open",
      due_at: params.dueAt ?? null,
    }).select("*").single();
    if (error) throw error;
    return data as Task;
  }

  async listTasks(businessId: string, limit = 200): Promise<Task[]> {
    const db = getAdminClient();
    const { data, error } = await db.from("tasks").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as Task[];
  }

  async updateTask(
    businessId: string,
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "priority" | "status" | "due_at">>,
  ): Promise<Task | null> {
    const db = getAdminClient();
    const { data, error } = await db.from("tasks").update(patch).eq("business_id", businessId).eq("id", taskId).select("*").maybeSingle();
    if (error) throw error;
    return (data as Task) ?? null;
  }
}
