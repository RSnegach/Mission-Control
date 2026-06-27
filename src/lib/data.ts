import { getBackend, type RequestPatch } from "./backend";
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

// --- Writes ---
export function updateSettings(
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
  return getBackend().updateSettings(businessId, patch);
}

export function createOutboundMessage(params: {
  businessId: string;
  contactId: string | null;
  requestId: string | null;
  fromNumber: string;
  toNumber: string;
  body: string;
  status?: string;
  twilioMessageSid?: string | null;
}): Promise<Message> {
  return getBackend().createOutboundMessage(params);
}

export function updateContactName(
  businessId: string,
  contactId: string,
  name: string | null,
): Promise<Contact | null> {
  return getBackend().updateContactName(businessId, contactId, name);
}

export function createInboundMessage(params: {
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
  return getBackend().createInboundMessage(params);
}

export function listDueAckThreads(now: string, limit = 100): Promise<CallRequest[]> {
  return getBackend().listDueAckThreads(now, limit);
}

export function armAck(businessId: string, requestId: string, dueAt: string): Promise<void> {
  return getBackend().armAck(businessId, requestId, dueAt);
}

export function markAckSent(
  businessId: string,
  requestId: string,
  sentAt: string,
): Promise<boolean> {
  return getBackend().markAckSent(businessId, requestId, sentAt);
}

// --- Requests: triage, create, schedule ---
export function getRequestById(businessId: string, requestId: string): Promise<CallRequest | null> {
  return getBackend().getRequestById(businessId, requestId);
}
export function listRequests(businessId: string, limit = 500): Promise<CallRequest[]> {
  return getBackend().listRequests(businessId, limit);
}
export function updateRequest(businessId: string, requestId: string, patch: RequestPatch): Promise<CallRequest | null> {
  return getBackend().updateRequest(businessId, requestId, patch);
}
export function createRequest(params: {
  businessId: string; contactId: string | null; title: string;
  priority?: string; dueAt?: string | null; description?: string | null; source?: string;
}): Promise<CallRequest> {
  return getBackend().createRequest(params);
}
export function listDueReminders(now: string, limit = 100): Promise<CallRequest[]> {
  return getBackend().listDueReminders(now, limit);
}
export function markReminderSent(businessId: string, requestId: string, sentAt: string): Promise<boolean> {
  return getBackend().markReminderSent(businessId, requestId, sentAt);
}

export function getBusinessFromNumber(businessId: string): Promise<string | null> {
  return getBackend().getBusinessFromNumber(businessId);
}

// --- Contacts: create ---
export function createContact(params: {
  businessId: string; name?: string | null; phone?: string | null; email?: string | null;
}): Promise<Contact> {
  return getBackend().createContact(params);
}

// --- Activity / notes ---
export function createActivity(params: {
  businessId: string; contactId?: string | null; requestId?: string | null;
  kind: string; body: string; createdBy?: string | null;
}): Promise<Activity> {
  return getBackend().createActivity(params);
}
export function listActivityByContact(businessId: string, contactId: string, limit = 200): Promise<Activity[]> {
  return getBackend().listActivityByContact(businessId, contactId, limit);
}
export function listActivityByRequest(businessId: string, requestId: string, limit = 200): Promise<Activity[]> {
  return getBackend().listActivityByRequest(businessId, requestId, limit);
}

// --- Tags ---
export function listTags(businessId: string): Promise<Tag[]> {
  return getBackend().listTags(businessId);
}
export function createTag(businessId: string, name: string, color: string): Promise<Tag> {
  return getBackend().createTag(businessId, name, color);
}
export function addTagToContact(businessId: string, contactId: string, tagId: string): Promise<void> {
  return getBackend().addTagToContact(businessId, contactId, tagId);
}
export function removeTagFromContact(businessId: string, contactId: string, tagId: string): Promise<void> {
  return getBackend().removeTagFromContact(businessId, contactId, tagId);
}
export function listTagsForContacts(businessId: string, contactIds: string[]): Promise<Map<string, string[]>> {
  return getBackend().listTagsForContacts(businessId, contactIds);
}

// --- Tasks ---
export function createTask(params: {
  businessId: string; title: string; description?: string | null; priority?: string; dueAt?: string | null;
}): Promise<Task> {
  return getBackend().createTask(params);
}
export function listTasks(businessId: string, limit = 200): Promise<Task[]> {
  return getBackend().listTasks(businessId, limit);
}
export function updateTask(
  businessId: string,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "description" | "priority" | "status" | "due_at">>,
): Promise<Task | null> {
  return getBackend().updateTask(businessId, taskId, patch);
}
