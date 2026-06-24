import { getBackend } from "./backend";
import type { Business, BusinessSettings, Call, CallRequest, Contact, Message } from "./types";

/**
 * Data facade. Delegates to the active backend (mock or Supabase), selected by
 * MOCK_MODE. Callers (Twilio webhooks, dashboard) import from here and never
 * touch a backend directly, so switching from mock to real is a config change.
 */

export function findBusinessByTwilioNumber(toNumber: string): Promise<Business | null> {
  return getBackend().findBusinessByTwilioNumber(toNumber);
}

export function getSettings(businessId: string): Promise<BusinessSettings | null> {
  return getBackend().getSettings(businessId);
}

export function findOrCreateContact(
  businessId: string,
  fromNumber: string,
): Promise<Contact | null> {
  return getBackend().findOrCreateContact(businessId, fromNumber);
}

export function createIncomingCall(params: {
  businessId: string;
  callSid: string;
  fromNumber: string;
  toNumber: string;
  contactId: string | null;
}): Promise<Call> {
  return getBackend().createIncomingCall(params);
}

export function updateCallBySid(
  callSid: string,
  patch: Partial<Omit<Call, "id" | "business_id" | "twilio_call_sid" | "created_at">>,
): Promise<Call | null> {
  return getBackend().updateCallBySid(callSid, patch);
}

export function getCallBySid(callSid: string): Promise<Call | null> {
  return getBackend().getCallBySid(callSid);
}

export function createMissedCallRequest(call: Call): Promise<CallRequest | null> {
  return getBackend().createMissedCallRequest(call);
}

export function recordCallEvent(params: {
  businessId: string | null;
  callId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  return getBackend().recordCallEvent(params);
}

export function listCalls(businessId: string, limit = 100): Promise<Call[]> {
  return getBackend().listCalls(businessId, limit);
}

export function listMissedRequests(businessId: string, limit = 100): Promise<CallRequest[]> {
  return getBackend().listMissedRequests(businessId, limit);
}

export function getPrimaryBusiness(): Promise<Business | null> {
  return getBackend().getPrimaryBusiness();
}

export function getContactsByIds(
  businessId: string,
  ids: string[],
): Promise<Map<string, Contact>> {
  return getBackend().getContactsByIds(businessId, ids);
}

// --- Messages ---
export function listMessagesByContact(
  businessId: string,
  contactId: string,
  limit = 200,
): Promise<Message[]> {
  return getBackend().listMessagesByContact(businessId, contactId, limit);
}

export function listMessagesByRequest(
  businessId: string,
  requestId: string,
): Promise<Message[]> {
  return getBackend().listMessagesByRequest(businessId, requestId);
}

export function listMessagesByCall(businessId: string, callId: string): Promise<Message[]> {
  return getBackend().listMessagesByCall(businessId, callId);
}

export function listRecentMessages(businessId: string, limit = 200): Promise<Message[]> {
  return getBackend().listRecentMessages(businessId, limit);
}

// --- Contacts / clients ---
export function getContactById(businessId: string, contactId: string): Promise<Contact | null> {
  return getBackend().getContactById(businessId, contactId);
}

export function listContacts(businessId: string, limit = 200): Promise<Contact[]> {
  return getBackend().listContacts(businessId, limit);
}

// --- Per-contact history ---
export function listCallsByContact(
  businessId: string,
  contactId: string,
  limit = 100,
): Promise<Call[]> {
  return getBackend().listCallsByContact(businessId, contactId, limit);
}

export function listRequestsByContact(
  businessId: string,
  contactId: string,
  limit = 100,
): Promise<CallRequest[]> {
  return getBackend().listRequestsByContact(businessId, contactId, limit);
}
