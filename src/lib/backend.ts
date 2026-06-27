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
import { MockBackend } from "./mock-backend";
import { SupabaseBackend } from "./supabase-backend";

/** Mutable fields on a callback request. */
export type RequestPatch = Partial<
  Pick<CallRequest, "status" | "priority" | "due_at" | "description" | "scheduled_for">
>;

/**
 * Data backend adapter.
 *
 * The app talks to one of these, never to Supabase directly. Two implementations:
 *   - MockBackend: in-memory, seeded sample data. No external services.
 *   - SupabaseBackend: real Postgres via supabase-js.
 *
 * getBackend() picks based on MOCK_MODE. This keeps the Twilio webhooks and the
 * dashboard identical across both, so flipping to real infrastructure is a config
 * change, not a code change.
 */
export interface DataBackend {
  findBusinessByTwilioNumber(toNumber: string): Promise<Business | null>;
  getSettings(businessId: string): Promise<BusinessSettings | null>;
  findOrCreateContact(businessId: string, fromNumber: string): Promise<Contact | null>;
  createIncomingCall(params: {
    businessId: string;
    callSid: string;
    fromNumber: string;
    toNumber: string;
    contactId: string | null;
  }): Promise<Call>;
  updateCallBySid(
    callSid: string,
    patch: Partial<Omit<Call, "id" | "business_id" | "twilio_call_sid" | "created_at">>,
  ): Promise<Call | null>;
  getCallBySid(callSid: string): Promise<Call | null>;
  createMissedCallRequest(call: Call): Promise<CallRequest | null>;
  recordCallEvent(params: {
    businessId: string | null;
    callId: string | null;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  listCalls(businessId: string, limit?: number): Promise<Call[]>;
  listMissedRequests(businessId: string, limit?: number): Promise<CallRequest[]>;
  getPrimaryBusiness(): Promise<Business | null>;
  getContactsByIds(businessId: string, ids: string[]): Promise<Map<string, Contact>>;

  // --- Messages (SMS) ---
  // Thread reads sort ascending (oldest first) so conversations read top to bottom.
  listMessagesByContact(businessId: string, contactId: string, limit?: number): Promise<Message[]>;
  listMessagesByRequest(businessId: string, requestId: string): Promise<Message[]>;
  listMessagesByCall(businessId: string, callId: string): Promise<Message[]>;
  // List read sorts descending (newest first).
  listRecentMessages(businessId: string, limit?: number): Promise<Message[]>;

  // --- Contacts / clients ---
  getContactById(businessId: string, contactId: string): Promise<Contact | null>;
  listContacts(businessId: string, limit?: number): Promise<Contact[]>;

  // --- Per-contact history ---
  listCallsByContact(businessId: string, contactId: string, limit?: number): Promise<Call[]>;
  listRequestsByContact(businessId: string, contactId: string, limit?: number): Promise<CallRequest[]>;

  // --- Writes ---
  updateSettings(
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
  ): Promise<BusinessSettings | null>;
  createOutboundMessage(params: {
    businessId: string;
    contactId: string | null;
    requestId: string | null;
    fromNumber: string;
    toNumber: string;
    body: string;
    status?: string;
    twilioMessageSid?: string | null;
  }): Promise<Message>;
  /** Record an inbound SMS. Idempotent on twilio_message_sid. */
  createInboundMessage(params: {
    businessId: string;
    contactId: string | null;
    requestId: string | null;
    fromNumber: string;
    toNumber: string;
    body: string;
    status?: string;
    twilioMessageSid?: string | null;
    mediaUrls?: string[] | null;
  }): Promise<Message>;
  /** Set (or clear, with null) a contact's display name. Tenant-scoped. */
  updateContactName(
    businessId: string,
    contactId: string,
    name: string | null,
  ): Promise<Contact | null>;

  // --- Auto-acknowledgment debounce (on requests) ---
  /** Requests armed for an ack whose due time has passed and not yet acked. Global. */
  listDueAckThreads(now: string, limit?: number): Promise<CallRequest[]>;
  /** Set the ack due time on a request, only if it has not already been acked. */
  armAck(businessId: string, requestId: string, dueAt: string): Promise<void>;
  /** Atomically claim+mark a request acked. Returns true if this call won the claim. */
  markAckSent(businessId: string, requestId: string, sentAt: string): Promise<boolean>;

  // --- Requests: triage, create, schedule ---
  getRequestById(businessId: string, requestId: string): Promise<CallRequest | null>;
  /** All requests (any status), newest first, for the full board/queue. */
  listRequests(businessId: string, limit?: number): Promise<CallRequest[]>;
  updateRequest(businessId: string, requestId: string, patch: RequestPatch): Promise<CallRequest | null>;
  createRequest(params: {
    businessId: string;
    contactId: string | null;
    title: string;
    priority?: string;
    dueAt?: string | null;
    description?: string | null;
    source?: string;
  }): Promise<CallRequest>;
  /** Scheduled callbacks whose reminder is due and not yet sent. Global (sweeper). */
  listDueReminders(now: string, limit?: number): Promise<CallRequest[]>;
  markReminderSent(businessId: string, requestId: string, sentAt: string): Promise<boolean>;

  /** The business's primary active Twilio number (the "from" for outbound SMS). */
  getBusinessFromNumber(businessId: string): Promise<string | null>;

  // --- Contacts: create ---
  createContact(params: {
    businessId: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  }): Promise<Contact>;

  // --- Activity / notes ---
  createActivity(params: {
    businessId: string;
    contactId?: string | null;
    requestId?: string | null;
    kind: string;
    body: string;
    createdBy?: string | null;
  }): Promise<Activity>;
  listActivityByContact(businessId: string, contactId: string, limit?: number): Promise<Activity[]>;
  listActivityByRequest(businessId: string, requestId: string, limit?: number): Promise<Activity[]>;

  // --- Tags ---
  listTags(businessId: string): Promise<Tag[]>;
  createTag(businessId: string, name: string, color: string): Promise<Tag>;
  addTagToContact(businessId: string, contactId: string, tagId: string): Promise<void>;
  removeTagFromContact(businessId: string, contactId: string, tagId: string): Promise<void>;
  /** Map of contactId -> tagId[] for the given contacts. */
  listTagsForContacts(businessId: string, contactIds: string[]): Promise<Map<string, string[]>>;

  // --- Tasks ---
  createTask(params: {
    businessId: string;
    title: string;
    description?: string | null;
    priority?: string;
    dueAt?: string | null;
  }): Promise<Task>;
  listTasks(businessId: string, limit?: number): Promise<Task[]>;
  updateTask(
    businessId: string,
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "priority" | "status" | "due_at">>,
  ): Promise<Task | null>;
}

/**
 * Telephony mock flag. Independent of where data is stored: in mock mode the
 * Twilio webhooks skip signature validation and outbound sends are not placed.
 */
export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

export type StorageBackendKind = "memory" | "sqlite" | "supabase";

/**
 * Which durable store backs the data layer, chosen by DATA_BACKEND.
 * Defaults to "memory" when unset to preserve prior behavior.
 *   memory   - in-memory, reseeds each process start (volatile)
 *   sqlite   - durable local file under ./.data (real, per-business, no cloud)
 *   supabase - managed Postgres (production; works on serverless)
 */
export function storageBackend(): StorageBackendKind {
  const v = (process.env.DATA_BACKEND ?? "").trim().toLowerCase();
  if (v === "sqlite" || v === "supabase" || v === "memory") return v;
  return "memory";
}

let cached: DataBackend | null = null;

/** Resolve the active backend. Cached for the process lifetime. */
export function getBackend(): DataBackend {
  if (cached) return cached;

  switch (storageBackend()) {
    case "sqlite": {
      // Lazy require so node:sqlite (and the file store) never enter the bundle
      // graph unless this backend is actually selected.
      const { SqliteBackend } = require("./sqlite-backend") as typeof import("./sqlite-backend");
      cached = new SqliteBackend();
      break;
    }
    case "supabase":
      // SupabaseBackend constructs its client lazily, so this import is inert
      // until a query runs.
      cached = new SupabaseBackend();
      break;
    case "memory":
    default:
      cached = new MockBackend();
      break;
  }
  return cached;
}
