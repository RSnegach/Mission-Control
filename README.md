# Mission Control

Multi-tenant Twilio incoming calls manager and business operations dashboard.

Every incoming call becomes structured business data. A call is logged, the caller
is matched to a contact, the call is routed to the business route phone, and if no
one answers it becomes a callback request. One codebase and one database serve many
businesses, separated by `business_id`.

This repo is the **MVP 1 spine**: incoming webhook → log call → forward → dial-result
→ missed-call request → dashboard. It is built production-shaped, not throwaway. Adding
a real customer later means inserting a business row and assigning a number, not a rewrite.

## Run locally in mock mode (no Supabase, no Twilio)

`MOCK_MODE=true` runs the whole app on in-memory sample data. No accounts, no
credentials, no external services. `/dashboard` loads seeded calls and callbacks,
and the Twilio webhooks work against the in-memory store.

```bash
npm install
npm run dev            # MOCK_MODE=true is already set in .env.local
```

Open **http://localhost:3000/dashboard**. You'll see the demo business
"Demo Marine Repair" with stat cards, a callback queue (three seeded missed calls),
and a recent-calls table mixing answered and missed.

> If you ever run `npm run build` in this checkout and then `npm run dev`, the dev
> compiler can collide with the leftover production bundles in `.next` and throw
> `__webpack_modules__[moduleId] is not a function`. Use **`npm run dev:clean`**
> (wipes `.next` first) or **`npm run clean`** to clear it. The mock demo only ever
> needs `npm run dev`, so this won't happen unless you also build.

`npm run dev` reads `.env.local`, which ships with `MOCK_MODE=true`. If you don't
have that file, create it (or copy `.env.example` to `.env.local`) with one line:

```
MOCK_MODE=true
```

### Pages

The app has a persistent left sidebar across these tabs:

- **Dashboard** — stat cards (calls today, missed, answered rate, open callbacks) plus charts: calls by hour, answered vs missed (donut), calls per day.
- **Calls** — full call log with status filter and caller search. Each row expands to show the automated text follow-up, the caller's replies, the call timeline, the linked request, and a link to the client.
- **Clients** — every caller as a client record with call and message counts; click through to a profile showing call history, open requests, and the full message thread.
- **Requests** — the open callback queue with priority and overdue flagging.
- **Messages** — recent SMS conversations grouped by client.

The landing page at `/` stays outside the app shell (no sidebar).

**Light and dark mode.** Toggle from the sidebar footer (or the landing page header).
The choice persists in `localStorage` and an inline script applies it before first
paint, so there is no flash. With no saved choice the app follows the OS preference,
defaulting to dark. Theme tokens live as CSS variables in `globals.css`; charts read a
matching JS palette (`src/lib/theme.ts`) since SVG cannot resolve CSS variables.

### Exercise the webhooks without a phone

The webhooks are plain POST endpoints. Drive them with curl while `npm run dev` runs:

```bash
# Incoming call -> logs it, returns Dial TwiML
curl -X POST http://localhost:3000/api/twilio/voice/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "To=+13215550100&From=+14075551234&CallSid=CA_demo_test_1"

# No-answer result -> marks the call missed, creates a callback request
curl -X POST http://localhost:3000/api/twilio/voice/dial-result \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "CallSid=CA_demo_test_1&DialCallStatus=no-answer"
```

Reload `/calls`: the new caller appears as **Missed** and a new **Missed call callback**
is in the **Requests** queue. `DialCallStatus=completed&DialCallDuration=42` instead
marks it **Answered** with a 0:42 duration.

Mock state lives in memory for the dev process. It survives hot-reload but resets when
you restart `npm run dev`. The seeded number to call is `+13215550100`.

## How mock vs real is wired

Two independent switches:

- **`DATA_BACKEND`** selects where data is stored. The app never talks to a database
  directly; it talks to a `DataBackend` adapter (`src/lib/backend.ts`) and `getBackend()`
  picks one:
  - `memory` (default) — `MockBackend`, in-memory, reseeds each start, volatile.
  - `sqlite` — `SqliteBackend`, a durable local file at `./.data/mission-control.sqlite`,
    real and per-business, no cloud account. Seeded with ~12 months of demo history on
    first run. This is the local-dev default in `.env.local`.
  - `supabase` — `SupabaseBackend`, managed Postgres for production.
- **`MOCK_MODE`** controls telephony only: when `true`, Twilio signature validation is
  skipped and outbound SMS is persisted without calling Twilio.

The webhooks and pages import from `src/lib/data.ts`, a thin facade over the active
backend, so switching storage or telephony is config, not code.

**Important for production:** `DATA_BACKEND=sqlite` writes to the local filesystem, which
does NOT work on Vercel serverless (ephemeral, read-only). Deploy with
`DATA_BACKEND=supabase` after running the migrations in `supabase/migrations/`. The
sqlite store is for local dev or a single always-on host.

To go fully live: set `DATA_BACKEND=supabase`, `MOCK_MODE=false`, and fill in the
Supabase and Twilio vars below.

## Stack

- **Next.js (App Router), full-stack.** API routes handle Twilio webhooks; server
  components render the dashboard.
- **Supabase Postgres** via `@supabase/supabase-js` (service role, server only).
- **Twilio Programmable Voice.**

## Project layout

```
src/
  app/
    page.tsx                              landing (no sidebar)
    (app)/                                route group: shared sidebar shell
      layout.tsx                          Sidebar + content area
      dashboard/page.tsx                  stats + charts
      calls/page.tsx                      call log with expandable rows
      clients/page.tsx                    client list
      clients/[id]/page.tsx               client profile + timeline
      requests/page.tsx                   callback queue
      messages/page.tsx                   SMS conversations
    api/twilio/voice/
      incoming/route.ts                   POST: log call, return Dial TwiML
      dial-result/route.ts                POST: update status, create missed request
  components/
    Sidebar.tsx                           nav (client)
    PageHeader, StatCard, Section, Table, Badge   shared primitives
    CallLog.tsx, CallRow.tsx              filterable log + expandable row (client)
    MessageThread.tsx, CallTimeline.tsx   SMS bubbles, call timeline
    charts/                               Recharts client components
  lib/
    backend.ts                            DataBackend interface + getBackend() selector
    mock-backend.ts                       in-memory seeded backend (MOCK_MODE=true)
    supabase-backend.ts                   real Postgres backend (MOCK_MODE=false)
    data.ts                               facade: delegates to the active backend
    analytics.ts                          pure aggregation for charts/grouping
    supabase.ts                           server-only admin client
    twilio.ts                             signature validation, TwiML builders
    phone.ts                              E.164 normalization
    format.ts                             formatting helpers
    types.ts                              row types (incl. Message)
supabase/
  migrations/0001_init.sql                schema + indexes + triggers
  seed.sql                                one demo business + number + settings
.env.example
```

Note: the `messages` SMS data is mock-only for now. The `Message` type and backend
reads exist, and `SupabaseBackend` has matching queries, but a `messages` table
migration is a later step before mock mode is turned off.

## Go live for testing (real Supabase + Twilio, local + ngrok)

This runs the app against real services for testing, at roughly $0, reachable over a
public ngrok URL behind a shared password. Real calls and texts flow through Twilio
into a real Supabase database. It only works while your machine + ngrok are running.

Cost: Supabase Free (pauses after a week idle), a Twilio trial (free units, one
number, can only call/text VERIFIED numbers, 30-day expiry, no A2P needed), and the
ngrok free static domain. Real money starts later: a Twilio number is ~$1.15/mo plus
usage once you leave the trial, and business SMS then needs A2P 10DLC registration.

### 1. Supabase

1. Create a free project at supabase.com.
2. SQL editor: run the migrations in order, `0001_init.sql` through `0005_ack.sql`.
3. Edit `supabase/seed.sql` (the two `EDIT ME` lines): set `twilio_numbers.phone_number`
   to your Twilio number and `default_route_phone` to your verified cell. Run it.
4. Settings → API: copy the Project URL, the anon key, and the service_role key.

### 2. Twilio (trial)

1. Create a trial account. Verify your own cell under Phone Numbers → Verified Caller IDs
   (on trial you can only call/text verified numbers).
2. Get your trial number. Note the Account SID and Auth Token from the console.

### 3. ngrok

```bash
ngrok http 3000
```

Use your free static domain so the URL is stable across restarts. Copy the `https://` URL.

### 4. `.env.local`

```
MOCK_MODE=false
DATA_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...        # server only, secret
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
APP_BASE_URL=https://<your-ngrok-domain>   # no trailing slash, must match Twilio exactly
TWILIO_VALIDATE_SIGNATURE=true
SITE_PASSWORD=<choose a password>
ACK_SWEEP_SECRET=<any random string>
```

`APP_BASE_URL` must byte-match the webhook URLs you set in Twilio (scheme + host +
path, no trailing slash), or signature validation rejects the requests.

### 5. Twilio console webhooks

On your number, both set to **HTTP POST**:

- Voice, "A call comes in" → `<APP_BASE_URL>/api/twilio/voice/incoming`
- Messaging, "A message comes in" → `<APP_BASE_URL>/api/twilio/messaging/incoming`

The dial-result callback is set by the TwiML itself; no console step.

### 6. Run and test

```bash
npm run dev
```

Open `<APP_BASE_URL>/login`, enter `SITE_PASSWORD`. Then from your verified cell:

- Call the Twilio number → it forwards to your route phone and logs the call. Ignore it →
  a missed-call callback appears and the follow-up text is sent.
- Text the Twilio number → the reply shows in Messages, and about 30 seconds after your
  last text an acknowledgment is sent back.

Everything is stored in Supabase and visible on the live dashboard.

### Notes

- The shared password is a single site-wide gate, not per-user login. Per-tenant auth is
  a later step.
- Local mock mode is unaffected: leave `SITE_PASSWORD` unset and `MOCK_MODE=true` /
  `DATA_BACKEND=sqlite` for the offline demo.
- The 30s ack timer runs because this is a persistent local process. On serverless hosts
  it would need a scheduled cron hitting `/api/internal/ack-sweep` (guarded by
  `ACK_SWEEP_SECRET`).

## How multi-tenancy works

Every tenant-owned table carries `business_id`. The incoming webhook maps Twilio's
`To` number to a business via `twilio_numbers`, and all reads filter by that
`business_id`. Adding a customer is: insert a `businesses` row, insert their
`twilio_numbers` row, set `business_settings`. No code change. The dashboard currently
shows the single seeded business; per-tenant routing and auth arrive with MVP 5.

Business behavior lives in `business_settings` (route phone, dial timeout, voicemail
greeting, callback SLA), never hardcoded. Operational changes are edits, not redeploys.

## Idempotency and debugging

Twilio retries webhooks. Calls are unique on `twilio_call_sid`, contacts on
`(business_id, phone)`, and the missed-call request is deduped per `call_id`, so
retries do not create duplicates. Every webhook payload is stored raw in `call_events`
for debugging when routing misbehaves.

## Hosting

The app is host-agnostic: it needs a public HTTPS URL, a database connection, Twilio
credentials, and env vars. Moving hosts is a migration, not a rebuild.

- **Phase 1 (build/demo):** Vercel Hobby + Supabase Free + one Twilio test number. ~$2–10/mo.
- **Phase 2 (first pilot):** Vercel + Supabase, or Railway/Render/Fly for a backend that
  runs background jobs more easily. ~$10–60/mo.
- **Phase 3 (multiple customers):** stay managed, or move to a single VPS (Docker Compose
  + Postgres + Caddy) for lowest cost and full control.

Do not run production from a laptop. Edit locally → push to GitHub → host auto-deploys.

> Note on the DB layer: this MVP uses `@supabase/supabase-js`, which talks to Supabase's
> API rather than raw Postgres. The schema SQL is portable, but switching to plain Postgres
> (e.g. Neon) later would mean swapping the data layer in `src/lib`. Staying on Supabase is
> the fastest path for the demo.

## Production hardening (later MVPs, not done here)

These are upgrades to the same spine, in roughly this order:

- [ ] **Auth + RBAC** (Supabase Auth or Clerk); scope the dashboard to the logged-in user's business.
- [ ] **Enforce Twilio signature validation:** set `TWILIO_VALIDATE_SIGNATURE=true`. Code is in `src/lib/twilio.ts`.
- [ ] **Row Level Security** in Postgres as a second isolation layer behind app filtering.
- [ ] **Voicemail** (MVP 2): `<Record>` on missed calls + recording-complete callback.
- [ ] **SMS follow-up** (MVP 4): outbound after a miss, inbound webhook, STOP handling, A2P 10DLC.
- [ ] Error + uptime monitoring, database backups, usage tracking.
- [ ] Recording disclosure, retention policy, terms/privacy before real clients.

## License

See `LICENSE`.
