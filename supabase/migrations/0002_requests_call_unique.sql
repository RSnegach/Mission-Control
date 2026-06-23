-- Standalone migration for projects that already applied 0001_init.sql before
-- the unique index was added there. Safe to run regardless (IF NOT EXISTS).
--
-- Enforces one call-sourced request per call so concurrent dial-result webhook
-- retries cannot create duplicate "Missed call callback" rows. See
-- src/lib/data.ts createMissedCallRequest, which relies on this for its 23505
-- race fallback.
--
-- Note: if duplicate (business_id, call_id, source='call') rows already exist,
-- this index creation will fail. De-dup first, keeping the earliest row:
--   delete from requests r using requests d
--   where r.business_id = d.business_id and r.call_id = d.call_id
--     and r.source = 'call' and d.source = 'call'
--     and r.call_id is not null and r.created_at > d.created_at;

create unique index if not exists uq_requests_call_source
  on requests(business_id, call_id, source)
  where call_id is not null and source = 'call';
