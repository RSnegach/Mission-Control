import type { Business, BusinessSettings, Call, CallRequest, Contact, Message } from "./types";
import { MockBackend } from "./mock-backend";
import { SupabaseBackend } from "./supabase-backend";

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
        "default_route_phone" | "sms_followup_enabled" | "sms_followup_template"
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
}

/** True when the app should run entirely on mock data, with no Supabase/Twilio. */
export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

let cached: DataBackend | null = null;

/** Resolve the active backend. Cached for the process lifetime. */
export function getBackend(): DataBackend {
  if (cached) return cached;

  // Both classes are import-safe: SupabaseBackend only constructs the supabase
  // client lazily inside getAdminClient(), so importing it in mock mode is inert.
  cached = isMockMode() ? new MockBackend() : new SupabaseBackend();
  return cached;
}
