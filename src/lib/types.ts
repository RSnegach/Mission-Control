// Row shapes for the MVP 1 tables. Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate with the Supabase CLI type generator once the schema stabilizes.

export interface Business {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessSettings {
  id: string;
  business_id: string;
  default_route_phone: string | null;
  voicemail_greeting: string | null;
  after_hours_behavior: string | null;
  dial_timeout_seconds: number;
  callback_sla_minutes: number | null;
  sms_followup_enabled: boolean;
  sms_followup_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface TwilioNumber {
  id: string;
  business_id: string;
  phone_number: string;
  twilio_sid: string | null;
  type: string;
  status: string;
  created_at: string;
}

export interface Contact {
  id: string;
  business_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  business_id: string;
  twilio_call_sid: string;
  parent_call_sid: string | null;
  from_number: string | null;
  to_number: string | null;
  contact_id: string | null;
  direction: string;
  status: string;
  route_target: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  recording_sid: string | null;
  outcome: string | null;
  created_request_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallRequest {
  id: string;
  business_id: string;
  contact_id: string | null;
  call_id: string | null;
  title: string;
  category: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  description: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  business_id: string;
  // MVP collapses clients into contacts, so contact_id alone identifies the
  // other party. client_id is omitted until clients become a distinct entity.
  contact_id: string | null;
  request_id: string | null; // links an automated text to the missed-call request
  twilio_message_sid: string | null;
  direction: "inbound" | "outbound"; // outbound = we texted them; inbound = their reply
  from_number: string | null;
  to_number: string | null;
  body: string;
  status: string; // queued | sent | delivered | received | failed
  media_urls: string[] | null;
  created_at: string;
}
