-- ===========================================================================
-- Mission Control: one-shot Supabase setup.
-- Paste this whole file into the Supabase SQL Editor and Run. It creates every
-- table/index and seeds one business. Idempotent: safe to run more than once.
--
-- BEFORE RUNNING, edit the two phone numbers in the SEED section at the bottom
-- (search for "EDIT ME"):
--   - your Twilio number
--   - the phone calls forward to (your verified cell on a Twilio trial)
-- Both in E.164 format, e.g. +13215551234.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- --- businesses ------------------------------------------------------------
create table if not exists businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  timezone    text not null default 'America/New_York',
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- --- business_settings -----------------------------------------------------
create table if not exists business_settings (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references businesses(id) on delete cascade,
  default_route_phone   text,
  voicemail_greeting    text,
  after_hours_behavior  text,
  dial_timeout_seconds  integer not null default 20,
  callback_sla_minutes  integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (business_id)
);

-- --- twilio_numbers --------------------------------------------------------
create table if not exists twilio_numbers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  phone_number  text unique not null,
  twilio_sid    text,
  type          text not null default 'local',
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

-- --- contacts --------------------------------------------------------------
create table if not exists contacts (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text,
  phone        text,
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, phone)
);

-- --- calls -----------------------------------------------------------------
create table if not exists calls (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  twilio_call_sid   text unique not null,
  parent_call_sid   text,
  from_number       text,
  to_number         text,
  contact_id        uuid references contacts(id) on delete set null,
  direction         text not null default 'inbound',
  status            text not null default 'incoming',
  route_target      text,
  started_at        timestamptz,
  answered_at       timestamptz,
  ended_at          timestamptz,
  duration_seconds  integer,
  recording_url     text,
  recording_sid     text,
  outcome           text,
  created_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- --- requests --------------------------------------------------------------
create table if not exists requests (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  call_id      uuid references calls(id) on delete set null,
  title        text not null,
  category     text,
  priority     text not null default 'normal',
  status       text not null default 'new',
  due_at       timestamptz,
  description  text,
  source       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- --- call_events -----------------------------------------------------------
create table if not exists call_events (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  call_id       uuid references calls(id) on delete cascade,
  event_type    text not null,
  payload_json  jsonb,
  created_at    timestamptz not null default now()
);

-- --- messages --------------------------------------------------------------
create table if not exists messages (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses(id) on delete cascade,
  contact_id         uuid references contacts(id) on delete set null,
  request_id         uuid references requests(id) on delete set null,
  twilio_message_sid text unique,
  direction          text not null,
  from_number        text,
  to_number          text,
  body               text not null default '',
  status             text,
  media_urls         jsonb,
  created_at         timestamptz not null default now()
);

-- --- later-migration columns (idempotent) ----------------------------------
alter table business_settings
  add column if not exists sms_followup_enabled  boolean not null default true,
  add column if not exists sms_followup_template text,
  add column if not exists ack_enabled           boolean not null default true,
  add column if not exists ack_template          text;

alter table requests
  add column if not exists ack_due_at  timestamptz,
  add column if not exists ack_sent_at timestamptz;

-- --- indexes ---------------------------------------------------------------
create index if not exists idx_calls_business_created on calls(business_id, created_at desc);
create index if not exists idx_calls_twilio_sid       on calls(twilio_call_sid);
create index if not exists idx_calls_from_number      on calls(business_id, from_number);
create index if not exists idx_contacts_phone         on contacts(business_id, phone);
create index if not exists idx_requests_business_status on requests(business_id, status);
create unique index if not exists uq_requests_call_source
  on requests(business_id, call_id, source)
  where call_id is not null and source = 'call';
create index if not exists idx_twilio_numbers_phone   on twilio_numbers(phone_number);
create index if not exists idx_call_events_call       on call_events(call_id, created_at desc);
create index if not exists idx_messages_business_created on messages(business_id, created_at desc);
create index if not exists idx_messages_contact on messages(business_id, contact_id, created_at);
create index if not exists idx_messages_request on messages(business_id, request_id, created_at);
create index if not exists idx_requests_ack_due
  on requests(business_id, ack_due_at)
  where ack_due_at is not null and ack_sent_at is null;

-- --- operability: scheduled callbacks, activity, tags, tasks ---------------
alter table requests
  add column if not exists scheduled_for    timestamptz,
  add column if not exists reminder_sent_at timestamptz;
create index if not exists idx_requests_reminder
  on requests(scheduled_for) where scheduled_for is not null and reminder_sent_at is null;

create table if not exists activity (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  request_id  uuid references requests(id) on delete set null,
  kind        text not null,
  body        text not null default '',
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_contact on activity(business_id, contact_id, created_at desc);
create index if not exists idx_activity_request on activity(business_id, request_id, created_at desc);

create table if not exists tags (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  color       text not null default '#4f7dff',
  created_at  timestamptz not null default now(),
  unique (business_id, name)
);
create table if not exists contact_tags (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id     uuid not null references tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);
create index if not exists idx_contact_tags_contact on contact_tags(contact_id);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title       text not null,
  description text,
  priority    text not null default 'normal',
  status      text not null default 'open',
  due_at      timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tasks_business on tasks(business_id, created_at desc);

-- --- updated_at triggers ---------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['businesses','business_settings','contacts','calls','requests','tasks']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on %1$s;
       create trigger trg_%1$s_updated_at before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ===========================================================================
-- SEED  (edit the two phone numbers below before running)
-- ===========================================================================
insert into businesses (name, slug, timezone)
values ('Demo Marine Repair', 'demo-marine', 'America/New_York')
on conflict (slug) do update set name = excluded.name;

with b as (select id from businesses where slug = 'demo-marine')
insert into twilio_numbers (business_id, phone_number, type)
select b.id, '+13215550100', 'local' from b   -- EDIT ME: your Twilio number, E.164
on conflict (phone_number) do update set business_id = excluded.business_id;

with b as (select id from businesses where slug = 'demo-marine')
insert into business_settings (
  business_id, default_route_phone, voicemail_greeting, after_hours_behavior,
  dial_timeout_seconds, callback_sla_minutes,
  sms_followup_enabled, sms_followup_template, ack_enabled, ack_template
)
select b.id,
       '+13215550199',   -- EDIT ME: phone calls forward to (your verified cell), E.164
       'Thanks for calling Demo Marine Repair. Please leave a message after the beep.',
       'voicemail',
       20,
       60,
       true,
       'Hi {name}, this is {business}. Sorry we missed your call. Drop a quick description of what we can help you with and we''ll get back to you as soon as possible.',
       true,
       'Thanks {name}, this is {business}. We''ve received your message and will get back to you very soon.'
from b
on conflict (business_id) do update
  set default_route_phone   = excluded.default_route_phone,
      voicemail_greeting    = excluded.voicemail_greeting,
      callback_sla_minutes  = excluded.callback_sla_minutes,
      sms_followup_enabled  = excluded.sms_followup_enabled,
      sms_followup_template = excluded.sms_followup_template,
      ack_enabled           = excluded.ack_enabled,
      ack_template          = excluded.ack_template;

-- Done. Verify with:  select name, slug from businesses;
