-- Mission Control — MVP 1 schema (call logger + forwarding spine)
-- Scope per brief section 28 plus call_events for raw webhook payloads.
-- Later MVPs add: clients, agents, users, messages, notes.
--
-- Run against your Supabase project (SQL editor or `supabase db push`).
-- Every tenant-scoped table carries business_id. App-level filtering enforces
-- isolation in MVP 1; RLS is added in MVP 7 (see README production notes).

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- businesses (tenants)
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  timezone    text not null default 'America/New_York',
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- business_settings (per-tenant behavior; editable without redeploy)
-- ---------------------------------------------------------------------------
create table if not exists business_settings (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references businesses(id) on delete cascade,
  default_route_phone   text,                       -- E.164 number to forward to
  voicemail_greeting    text,
  after_hours_behavior  text,                       -- e.g. 'voicemail' | 'route'
  dial_timeout_seconds  integer not null default 20,
  callback_sla_minutes  integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (business_id)
);

-- ---------------------------------------------------------------------------
-- twilio_numbers (maps a Twilio phone number to a business)
-- ---------------------------------------------------------------------------
create table if not exists twilio_numbers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  phone_number  text unique not null,               -- E.164, matched against Twilio "To"
  twilio_sid    text,
  type          text not null default 'local',
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- contacts (callers; matched/created by "From" number)
-- ---------------------------------------------------------------------------
create table if not exists contacts (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text,
  phone        text,                                -- E.164
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- one contact per phone per business; enables find-or-create + idempotency
  unique (business_id, phone)
);

-- ---------------------------------------------------------------------------
-- calls (one row per inbound call; keyed by Twilio CallSid)
-- ---------------------------------------------------------------------------
create table if not exists calls (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  twilio_call_sid   text unique not null,           -- idempotency anchor
  parent_call_sid   text,
  from_number       text,
  to_number         text,
  contact_id        uuid references contacts(id) on delete set null,
  direction         text not null default 'inbound',
  status            text not null default 'incoming',
  route_target      text,                           -- number we dialed
  started_at        timestamptz,
  answered_at       timestamptz,
  ended_at          timestamptz,
  duration_seconds  integer,
  recording_url     text,
  recording_sid     text,
  outcome           text,                           -- 'answered' | 'missed' | ...
  created_request_id uuid,                          -- set when a request is spawned
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- requests (work items; a missed call creates one)
-- ---------------------------------------------------------------------------
create table if not exists requests (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  call_id      uuid references calls(id) on delete set null,
  title        text not null,
  category     text,
  priority     text not null default 'normal',
  status       text not null default 'new',         -- 'new' | 'needs_callback' | ...
  due_at       timestamptz,
  description  text,
  source       text,                                -- 'call' | 'sms' | 'manual'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- call_events (raw webhook payloads for debugging + audit)
-- ---------------------------------------------------------------------------
create table if not exists call_events (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  call_id       uuid references calls(id) on delete cascade,
  event_type    text not null,                      -- 'incoming' | 'dial-result' | ...
  payload_json  jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (per brief section 14)
-- ---------------------------------------------------------------------------
create index if not exists idx_calls_business_created on calls(business_id, created_at desc);
create index if not exists idx_calls_twilio_sid       on calls(twilio_call_sid);
create index if not exists idx_calls_from_number      on calls(business_id, from_number);
create index if not exists idx_contacts_phone         on contacts(business_id, phone);
create index if not exists idx_requests_business_status on requests(business_id, status);
-- One call-sourced request per call. Backs the missed-call dedup against
-- concurrent webhook retries. Partial so manual/sms requests are unconstrained.
create unique index if not exists uq_requests_call_source
  on requests(business_id, call_id, source)
  where call_id is not null and source = 'call';
create index if not exists idx_twilio_numbers_phone   on twilio_numbers(phone_number);
create index if not exists idx_call_events_call       on call_events(call_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
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
  foreach t in array array['businesses','business_settings','contacts','calls','requests']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on %1$s;
       create trigger trg_%1$s_updated_at before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;
