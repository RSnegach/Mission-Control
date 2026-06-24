-- SMS/MMS messages. Completes the schema for real (non-mock) mode: the data
-- layer reads and writes this table (listMessagesBy*, listRecentMessages,
-- createOutboundMessage). In mock mode messages live in memory instead.
--
-- Tenant-scoped by business_id like every other table. E.164 phone numbers.

create table if not exists messages (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses(id) on delete cascade,
  contact_id         uuid references contacts(id) on delete set null,
  request_id         uuid references requests(id) on delete set null,
  twilio_message_sid text unique,                 -- idempotency anchor for inbound/status
  direction          text not null,               -- 'inbound' | 'outbound'
  from_number        text,                         -- E.164
  to_number          text,                         -- E.164
  body               text not null default '',
  status             text,                         -- queued | sent | delivered | received | failed
  media_urls         jsonb,                        -- array of MMS media URLs, or null
  created_at         timestamptz not null default now()
);

-- Recent-messages list (newest first) and per-thread reads.
create index if not exists idx_messages_business_created on messages(business_id, created_at desc);
create index if not exists idx_messages_contact on messages(business_id, contact_id, created_at);
create index if not exists idx_messages_request on messages(business_id, request_id, created_at);
