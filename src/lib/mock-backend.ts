import { toE164 } from "./phone";
import type { DataBackend } from "./backend";
import type { Business, BusinessSettings, Call, CallRequest, Contact, Message } from "./types";

/**
 * In-memory backend for MOCK_MODE. No Supabase, no Twilio, no credentials.
 *
 * State lives on globalThis so it survives Next.js hot-reload in dev (otherwise
 * every edit would reset your data mid-session). It is per-process and not
 * persisted: restarting `npm run dev` reseeds from scratch.
 *
 * The seed gives /dashboard real-looking content immediately: a demo business,
 * a few contacts, a mix of answered and missed calls from "today", and matching
 * callback requests in the queue.
 */

interface MockStore {
  businesses: Business[];
  settings: BusinessSettings[];
  twilioNumbers: { id: string; business_id: string; phone_number: string; status: string }[];
  contacts: Contact[];
  calls: Call[];
  requests: CallRequest[];
  messages: Message[];
  events: { id: string; business_id: string | null; call_id: string | null; event_type: string; payload_json: unknown; created_at: string }[];
  seq: number;
}

const GLOBAL_KEY = "__mission_control_mock_store__";

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function seed(): MockStore {
  const businessId = "biz_demo_marine";
  const now = new Date().toISOString();

  const business: Business = {
    id: businessId,
    name: "Demo Marine Repair",
    slug: "demo-marine",
    timezone: "America/New_York",
    status: "active",
    created_at: now,
    updated_at: now,
  };

  const settings: BusinessSettings = {
    id: "set_demo",
    business_id: businessId,
    default_route_phone: "+13215550199",
    voicemail_greeting:
      "Thanks for calling Demo Marine Repair. Please leave a message after the beep.",
    after_hours_behavior: "voicemail",
    dial_timeout_seconds: 20,
    callback_sla_minutes: 60,
    sms_followup_enabled: true,
    sms_followup_template:
      "Hi {name}, this is {business}. Sorry we missed your call. Drop a quick description of what we can help you with and we'll get back to you as soon as possible.",
    ack_enabled: true,
    ack_template:
      "Thanks {name}, this is {business}. We've received your message and will get back to you very soon.",
    created_at: now,
    updated_at: now,
  };

  const contacts: Contact[] = [
    { id: "con_1", business_id: businessId, name: "John at ABC Marine", phone: "+14075550123", email: null, created_at: minutesAgo(600), updated_at: minutesAgo(600) },
    { id: "con_2", business_id: businessId, name: "Smith LLC", phone: "+13215550144", email: null, created_at: minutesAgo(500), updated_at: minutesAgo(500) },
    { id: "con_3", business_id: businessId, name: null, phone: "+14075558831", email: null, created_at: minutesAgo(120), updated_at: minutesAgo(120) },
    { id: "con_4", business_id: businessId, name: null, phone: "+13215550199", email: null, created_at: minutesAgo(45), updated_at: minutesAgo(45) },
  ];

  const tn = "+13215550100";

  const calls: Call[] = [
    mkCall({ id: "call_1", businessId, sid: "CA_demo_0001", from: "+14075550123", to: tn, contactId: "con_1", status: "answered", outcome: "answered", minsAgo: 200, duration: 252 }),
    mkCall({ id: "call_2", businessId, sid: "CA_demo_0002", from: "+13215550144", to: tn, contactId: "con_2", status: "missed", outcome: "missed", minsAgo: 140, duration: null }),
    mkCall({ id: "call_3", businessId, sid: "CA_demo_0003", from: "+14075558831", to: tn, contactId: "con_3", status: "missed", outcome: "missed", minsAgo: 95, duration: null }),
    mkCall({ id: "call_4", businessId, sid: "CA_demo_0004", from: "+13215550199", to: tn, contactId: "con_4", status: "answered", outcome: "answered", minsAgo: 60, duration: 88 }),
    mkCall({ id: "call_5", businessId, sid: "CA_demo_0005", from: "+14075550123", to: tn, contactId: "con_1", status: "missed", outcome: "missed", minsAgo: 25, duration: null }),
  ];

  const requests: CallRequest[] = [
    mkReq({ id: "req_1", businessId, contactId: "con_2", callId: "call_2", minsAgo: 140, slaMin: 60 }),
    mkReq({ id: "req_2", businessId, contactId: "con_3", callId: "call_3", minsAgo: 95, slaMin: 60 }),
    mkReq({ id: "req_3", businessId, contactId: "con_1", callId: "call_5", minsAgo: 25, slaMin: 60 }),
  ];

  // Link calls back to their requests, matching real backend behavior.
  for (const r of requests) {
    const c = calls.find((x) => x.id === r.call_id);
    if (c) c.created_request_id = r.id;
  }

  // SMS threads for the missed calls. Three states: 2 replies, 1 reply, and 0
  // replies (texted, no answer yet). Every body is distinct. Anchored by
  // request_id; from/to relative to the Twilio number tn.
  const messages: Message[] = [
    // req_1 / call_2 -> Smith LLC (+13215550144): auto-text + 2 replies
    mkMsg({ id: "msg_1", businessId, contactId: "con_2", requestId: "req_1", dir: "outbound", from: tn, to: "+13215550144", body: "Hi Smith LLC, this is Demo Marine Repair. Sorry we missed your call. Drop a quick description of what we can help you with and we'll get back to you as soon as possible.", status: "delivered", minsAgo: 139 }),
    mkMsg({ id: "msg_2", businessId, contactId: "con_2", requestId: "req_1", dir: "inbound", from: "+13215550144", to: tn, body: "Hey, my boat's inboard is overheating after about ten minutes. Need a diagnostic this week.", status: "received", minsAgo: 135 }),
    mkMsg({ id: "msg_3", businessId, contactId: "con_2", requestId: "req_1", dir: "inbound", from: "+13215550144", to: tn, body: "It's a 2019 Sea Ray. Can someone call me back today?", status: "received", minsAgo: 134 }),

    // req_2 / call_3 -> (+14075558831): auto-text + 1 reply
    mkMsg({ id: "msg_4", businessId, contactId: "con_3", requestId: "req_2", dir: "outbound", from: tn, to: "+14075558831", body: "Hi there, this is Demo Marine Repair. Sorry we missed your call. Send over a few details on what you need and we'll follow up shortly.", status: "delivered", minsAgo: 94 }),
    mkMsg({ id: "msg_5", businessId, contactId: "con_3", requestId: "req_2", dir: "inbound", from: "+14075558831", to: tn, body: "Looking for a quote to winterize two outboards before the season ends.", status: "received", minsAgo: 90 }),

    // req_3 / call_5 -> ABC Marine (+14075550123): auto-text + 0 replies
    mkMsg({ id: "msg_6", businessId, contactId: "con_1", requestId: "req_3", dir: "outbound", from: tn, to: "+14075550123", body: "Hi John, this is Demo Marine Repair. Sorry we missed your call. Let us know what's going on with the boat and we'll reach out as soon as we can.", status: "delivered", minsAgo: 24 }),
  ];

  return {
    businesses: [business],
    settings: [settings],
    twilioNumbers: [{ id: "tn_1", business_id: businessId, phone_number: tn, status: "active" }],
    contacts,
    calls,
    requests,
    messages,
    events: [],
    seq: 1000,
  };
}

function mkMsg(p: {
  id: string; businessId: string; contactId: string | null; requestId: string | null;
  dir: "inbound" | "outbound"; from: string; to: string; body: string; status: string; minsAgo: number;
}): Message {
  const at = minutesAgo(p.minsAgo);
  return {
    id: p.id,
    business_id: p.businessId,
    contact_id: p.contactId,
    request_id: p.requestId,
    twilio_message_sid: `SM_demo_${p.id}`,
    direction: p.dir,
    from_number: p.from,
    to_number: p.to,
    body: p.body,
    status: p.status,
    media_urls: null,
    created_at: at,
  };
}

function mkCall(p: {
  id: string; businessId: string; sid: string; from: string; to: string;
  contactId: string | null; status: string; outcome: string; minsAgo: number; duration: number | null;
}): Call {
  const started = minutesAgo(p.minsAgo);
  const ended = p.duration !== null ? minutesAgo(p.minsAgo - Math.ceil(p.duration / 60)) : minutesAgo(p.minsAgo);
  return {
    id: p.id,
    business_id: p.businessId,
    twilio_call_sid: p.sid,
    parent_call_sid: null,
    from_number: p.from,
    to_number: p.to,
    contact_id: p.contactId,
    direction: "inbound",
    status: p.status,
    route_target: "+13215550199",
    started_at: started,
    answered_at: p.duration !== null ? started : null,
    ended_at: ended,
    duration_seconds: p.duration,
    recording_url: null,
    recording_sid: null,
    outcome: p.outcome,
    created_request_id: null,
    created_at: started,
    updated_at: ended,
  };
}

function mkReq(p: { id: string; businessId: string; contactId: string | null; callId: string; minsAgo: number; slaMin: number }): CallRequest {
  const created = minutesAgo(p.minsAgo);
  const due = new Date(new Date(created).getTime() + p.slaMin * 60_000).toISOString();
  return {
    id: p.id,
    business_id: p.businessId,
    contact_id: p.contactId,
    call_id: p.callId,
    title: "Missed call callback",
    category: null,
    priority: "normal",
    status: "needs_callback",
    due_at: due,
    description: null,
    source: "call",
    ack_due_at: null,
    ack_sent_at: null,
    created_at: created,
    updated_at: created,
  };
}

function store(): MockStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = seed();
  return g[GLOBAL_KEY] as MockStore;
}

function nextId(s: MockStore, prefix: string): string {
  s.seq += 1;
  return `${prefix}_${s.seq}`;
}

export class MockBackend implements DataBackend {
  async findBusinessByTwilioNumber(toNumber: string): Promise<Business | null> {
    const normalized = toE164(toNumber);
    if (!normalized) return null;
    const s = store();
    const tn = s.twilioNumbers.find((n) => n.phone_number === normalized && n.status === "active");
    if (!tn) return null;
    return s.businesses.find((b) => b.id === tn.business_id) ?? null;
  }

  async getSettings(businessId: string): Promise<BusinessSettings | null> {
    return store().settings.find((x) => x.business_id === businessId) ?? null;
  }

  async findOrCreateContact(businessId: string, fromNumber: string): Promise<Contact | null> {
    const normalized = toE164(fromNumber);
    if (!normalized) return null;
    const s = store();
    const existing = s.contacts.find((c) => c.business_id === businessId && c.phone === normalized);
    if (existing) return existing;
    const now = new Date().toISOString();
    const contact: Contact = {
      id: nextId(s, "con"),
      business_id: businessId,
      name: null,
      phone: normalized,
      email: null,
      created_at: now,
      updated_at: now,
    };
    s.contacts.push(contact);
    return contact;
  }

  async createIncomingCall(params: {
    businessId: string; callSid: string; fromNumber: string; toNumber: string; contactId: string | null;
  }): Promise<Call> {
    const s = store();
    const existing = s.calls.find((c) => c.twilio_call_sid === params.callSid);
    if (existing) {
      if (existing.business_id !== params.businessId) {
        throw new Error(`CallSid ${params.callSid} already belongs to a different business`);
      }
      return existing;
    }
    const now = new Date().toISOString();
    const call: Call = {
      id: nextId(s, "call"),
      business_id: params.businessId,
      twilio_call_sid: params.callSid,
      parent_call_sid: null,
      from_number: params.fromNumber,
      to_number: params.toNumber,
      contact_id: params.contactId,
      direction: "inbound",
      status: "incoming",
      route_target: null,
      started_at: now,
      answered_at: null,
      ended_at: null,
      duration_seconds: null,
      recording_url: null,
      recording_sid: null,
      outcome: null,
      created_request_id: null,
      created_at: now,
      updated_at: now,
    };
    s.calls.push(call);
    return call;
  }

  async updateCallBySid(
    callSid: string,
    patch: Partial<Omit<Call, "id" | "business_id" | "twilio_call_sid" | "created_at">>,
  ): Promise<Call | null> {
    const s = store();
    const call = s.calls.find((c) => c.twilio_call_sid === callSid);
    if (!call) return null;
    Object.assign(call, patch, { updated_at: new Date().toISOString() });
    return call;
  }

  async getCallBySid(callSid: string): Promise<Call | null> {
    return store().calls.find((c) => c.twilio_call_sid === callSid) ?? null;
  }

  async createMissedCallRequest(call: Call): Promise<CallRequest | null> {
    const s = store();
    const existing = s.requests.find(
      (r) => r.business_id === call.business_id && r.call_id === call.id && r.source === "call",
    );
    if (existing) return existing;

    const settings = await this.getSettings(call.business_id);
    const slaMinutes = settings?.callback_sla_minutes ?? 60;
    const now = new Date().toISOString();
    const req: CallRequest = {
      id: nextId(s, "req"),
      business_id: call.business_id,
      contact_id: call.contact_id,
      call_id: call.id,
      title: "Missed call callback",
      category: null,
      priority: "normal",
      status: "needs_callback",
      due_at: new Date(Date.now() + slaMinutes * 60_000).toISOString(),
      description: null,
      source: "call",
      ack_due_at: null,
      ack_sent_at: null,
      created_at: now,
      updated_at: now,
    };
    s.requests.push(req);
    call.created_request_id = req.id;
    return req;
  }

  async recordCallEvent(params: {
    businessId: string | null; callId: string | null; eventType: string; payload: Record<string, unknown>;
  }): Promise<void> {
    const s = store();
    s.events.push({
      id: nextId(s, "evt"),
      business_id: params.businessId,
      call_id: params.callId,
      event_type: params.eventType,
      payload_json: params.payload,
      created_at: new Date().toISOString(),
    });
  }

  async listCalls(businessId: string, limit = 100): Promise<Call[]> {
    return store()
      .calls.filter((c) => c.business_id === businessId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async listMissedRequests(businessId: string, limit = 100): Promise<CallRequest[]> {
    return store()
      .requests.filter((r) => r.business_id === businessId && r.status === "needs_callback")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async getPrimaryBusiness(): Promise<Business | null> {
    return store()
      .businesses.slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
  }

  async getContactsByIds(businessId: string, ids: string[]): Promise<Map<string, Contact>> {
    const map = new Map<string, Contact>();
    const unique = new Set(ids.filter(Boolean));
    for (const c of store().contacts) {
      if (c.business_id === businessId && unique.has(c.id)) map.set(c.id, c);
    }
    return map;
  }

  // --- Messages ---
  private threadAsc(msgs: Message[]): Message[] {
    return msgs.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async listMessagesByContact(businessId: string, contactId: string, limit = 200): Promise<Message[]> {
    return this.threadAsc(
      store().messages.filter((m) => m.business_id === businessId && m.contact_id === contactId),
    ).slice(0, limit);
  }

  async listMessagesByRequest(businessId: string, requestId: string): Promise<Message[]> {
    return this.threadAsc(
      store().messages.filter((m) => m.business_id === businessId && m.request_id === requestId),
    );
  }

  async listMessagesByCall(businessId: string, callId: string): Promise<Message[]> {
    const s = store();
    const call = s.calls.find((c) => c.business_id === businessId && c.id === callId);
    if (!call) return [];
    // Prefer the linked request's thread; fall back to the contact's messages.
    if (call.created_request_id) {
      const byReq = await this.listMessagesByRequest(businessId, call.created_request_id);
      if (byReq.length) return byReq;
    }
    if (call.contact_id) return this.listMessagesByContact(businessId, call.contact_id);
    return [];
  }

  async listRecentMessages(businessId: string, limit = 200): Promise<Message[]> {
    return store()
      .messages.filter((m) => m.business_id === businessId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  // --- Contacts / clients ---
  async getContactById(businessId: string, contactId: string): Promise<Contact | null> {
    return (
      store().contacts.find((c) => c.business_id === businessId && c.id === contactId) ?? null
    );
  }

  async listContacts(businessId: string, limit = 200): Promise<Contact[]> {
    return store()
      .contacts.filter((c) => c.business_id === businessId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  // --- Per-contact history ---
  async listCallsByContact(businessId: string, contactId: string, limit = 100): Promise<Call[]> {
    return store()
      .calls.filter((c) => c.business_id === businessId && c.contact_id === contactId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async listRequestsByContact(businessId: string, contactId: string, limit = 100): Promise<CallRequest[]> {
    return store()
      .requests.filter((r) => r.business_id === businessId && r.contact_id === contactId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
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
    const s = store();
    const row = s.settings.find((x) => x.business_id === businessId);
    if (!row) return null;
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    return row;
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
    const s = store();
    const msg: Message = {
      id: nextId(s, "msg"),
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
      created_at: new Date().toISOString(),
    };
    s.messages.push(msg);
    return msg;
  }

  async updateContactName(
    businessId: string,
    contactId: string,
    name: string | null,
  ): Promise<Contact | null> {
    const s = store();
    const c = s.contacts.find((x) => x.business_id === businessId && x.id === contactId);
    if (!c) return null;
    c.name = name;
    c.updated_at = new Date().toISOString();
    return c;
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
    const s = store();
    if (params.twilioMessageSid) {
      const existing = s.messages.find((m) => m.twilio_message_sid === params.twilioMessageSid);
      if (existing) return existing;
    }
    const msg: Message = {
      id: nextId(s, "msg"),
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
      created_at: new Date().toISOString(),
    };
    s.messages.push(msg);
    return msg;
  }

  async listDueAckThreads(now: string, limit = 100): Promise<CallRequest[]> {
    return store()
      .requests.filter(
        (r) => r.ack_due_at !== null && r.ack_sent_at === null && r.ack_due_at <= now,
      )
      .sort((a, b) => (a.ack_due_at ?? "").localeCompare(b.ack_due_at ?? ""))
      .slice(0, limit);
  }

  async armAck(businessId: string, requestId: string, dueAt: string): Promise<void> {
    const r = store().requests.find(
      (x) => x.business_id === businessId && x.id === requestId,
    );
    if (r && r.ack_sent_at === null) r.ack_due_at = dueAt;
  }

  async markAckSent(businessId: string, requestId: string, sentAt: string): Promise<boolean> {
    const r = store().requests.find(
      (x) => x.business_id === businessId && x.id === requestId,
    );
    if (!r || r.ack_sent_at !== null) return false;
    r.ack_sent_at = sentAt;
    r.ack_due_at = null;
    return true;
  }
}
