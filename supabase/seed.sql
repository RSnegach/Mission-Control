-- Seed one business for the MVP 1 demo.
-- Edit the two phone numbers before running:
--   twilio_numbers.phone_number  -> the Twilio number you bought (E.164)
--   business_settings.default_route_phone -> the phone Twilio should forward to (E.164)
--
-- Idempotent: re-running upserts the same business by slug.

insert into businesses (name, slug, timezone)
values ('Demo Marine Repair', 'demo-marine', 'America/New_York')
on conflict (slug) do update set name = excluded.name
returning id;

-- Resolve the business id by slug for the child rows.
with b as (
  select id from businesses where slug = 'demo-marine'
)
insert into twilio_numbers (business_id, phone_number, type)
select b.id, '+13215550100', 'local' from b
on conflict (phone_number) do update set business_id = excluded.business_id;

with b as (
  select id from businesses where slug = 'demo-marine'
)
insert into business_settings (business_id, default_route_phone, voicemail_greeting, after_hours_behavior, dial_timeout_seconds, callback_sla_minutes)
select b.id,
       '+13215550199',
       'Thanks for calling Demo Marine Repair. Please leave a message after the beep.',
       'voicemail',
       20,
       60
from b
on conflict (business_id) do update
  set default_route_phone   = excluded.default_route_phone,
      voicemail_greeting    = excluded.voicemail_greeting,
      callback_sla_minutes  = excluded.callback_sla_minutes;
