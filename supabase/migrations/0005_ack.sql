-- Editable auto-acknowledgment SMS + per-request debounce stamps.
-- After a caller replies, an ack is sent once, ACK_DEBOUNCE_MS (30s) after their
-- last inbound message. See src/lib/ack.ts (sweeper) and the messaging webhook.
-- Idempotent.

alter table business_settings
  add column if not exists ack_enabled  boolean not null default true,
  add column if not exists ack_template text;

update business_settings
set ack_template =
  'Thanks {name}, this is {business}. We''ve received your message and will get back to you very soon.'
where ack_template is null;

alter table requests
  add column if not exists ack_due_at  timestamptz,  -- when the ack becomes eligible
  add column if not exists ack_sent_at timestamptz;  -- set once sent (fire-once)

-- Sweeper lookup: armed requests whose due time passed and that have not acked.
create index if not exists idx_requests_ack_due
  on requests(business_id, ack_due_at)
  where ack_due_at is not null and ack_sent_at is null;
