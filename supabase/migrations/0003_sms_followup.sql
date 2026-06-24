-- Adds the editable missed-call SMS follow-up settings to business_settings.
-- Idempotent (safe to re-run). See src/lib/followup.ts for how these are used.
--
-- Note: sending also writes a row to a `messages` table. That table's migration
-- is a separate real-mode follow-on and is not created here; mock mode keeps
-- messages in memory.

alter table business_settings
  add column if not exists sms_followup_enabled  boolean not null default true,
  add column if not exists sms_followup_template text;

-- Backfill a sensible default for existing rows. {business} and {name} are
-- replaced at send time; {name} falls back to "there" when the caller is unknown.
update business_settings
set sms_followup_template =
  'Hi {name}, this is {business}. Sorry we missed your call. Reply here and we''ll help you out.'
where sms_followup_template is null;
