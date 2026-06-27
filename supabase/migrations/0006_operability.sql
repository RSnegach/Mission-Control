-- Operability: scheduled callbacks, activity/notes timeline, tags, tasks.
-- Adds the write-path tables/columns for the operability features (status triage,
-- notes, tags, tasks, scheduled callbacks). Idempotent.

-- Scheduled-callback columns on requests.
alter table requests
  add column if not exists scheduled_for    timestamptz,  -- a booked callback time
  add column if not exists reminder_sent_at timestamptz;  -- set once the reminder fires

create index if not exists idx_requests_reminder
  on requests(scheduled_for)
  where scheduled_for is not null and reminder_sent_at is null;

-- Activity / notes timeline (manual notes + auto-logged events).
create table if not exists activity (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  request_id  uuid references requests(id) on delete set null,
  kind        text not null,                 -- 'note' | 'status_change' | 'message_sent' | ...
  body        text not null default '',
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_contact on activity(business_id, contact_id, created_at desc);
create index if not exists idx_activity_request on activity(business_id, request_id, created_at desc);

-- Tags + contact tagging.
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

-- Tasks (single-operator to-do queue).
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title       text not null,
  description text,
  priority    text not null default 'normal',
  status      text not null default 'open',  -- open | done
  due_at      timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tasks_business on tasks(business_id, created_at desc);
