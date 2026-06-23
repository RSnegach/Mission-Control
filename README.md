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

Reload `/dashboard`: the new caller appears in recent calls as **Missed** and a new
**Missed call callback** is in the queue. `DialCallStatus=completed&DialCallDuration=42`
instead marks it **Answered** with a 0:42 duration.

Mock state lives in memory for the dev process. It survives hot-reload but resets when
you restart `npm run dev`. The seeded number to call is `+13215550100`.

## How mock vs real is wired

The app never talks to Supabase directly. It talks to a `DataBackend` adapter
(`src/lib/backend.ts`), and `getBackend()` picks the implementation from `MOCK_MODE`:

- `MockBackend` (`src/lib/mock-backend.ts`) — in-memory seeded store.
- `SupabaseBackend` (`src/lib/supabase-backend.ts`) — real Postgres, unchanged logic.

The Twilio webhooks and the dashboard import from `src/lib/data.ts`, a thin facade
over the active backend, so flipping to real infrastructure is a config change, not a
code change. Twilio signature validation is also auto-skipped in mock mode.

To switch to real services later: set `MOCK_MODE=false` (or remove it) and fill in the
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
    page.tsx                              landing
    dashboard/page.tsx                    calls + callback queue
    api/twilio/voice/
      incoming/route.ts                   POST: log call, return Dial TwiML
      dial-result/route.ts                POST: update status, create missed request
  lib/
    backend.ts                            DataBackend interface + getBackend() selector
    mock-backend.ts                       in-memory seeded backend (MOCK_MODE=true)
    supabase-backend.ts                   real Postgres backend (MOCK_MODE=false)
    data.ts                               facade: delegates to the active backend
    supabase.ts                           server-only admin client
    twilio.ts                             signature validation, TwiML builders
    phone.ts                              E.164 normalization
    format.ts                             dashboard formatting
    types.ts                              row types
supabase/
  migrations/0001_init.sql                schema + indexes + triggers
  seed.sql                                one demo business + number + settings
.env.example
```

## Going live with real services

Everything below applies only when you turn off mock mode (`MOCK_MODE=false`). Skip
it entirely while you're running the local mock demo above.

### 1. Database setup (Supabase)

1. Create a project at supabase.com. Free tier is fine for the demo.
2. Open the SQL editor and run `supabase/migrations/0001_init.sql`.
3. Edit `supabase/seed.sql`: set `twilio_numbers.phone_number` to your Twilio number
   (E.164, e.g. `+13215550100`) and `business_settings.default_route_phone` to the
   phone you want calls forwarded to (your cell for the demo). Run it.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Var | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role key (server only, secret) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → anon key |
| `TWILIO_ACCOUNT_SID` | Twilio console |
| `TWILIO_AUTH_TOKEN` | Twilio console |
| `APP_BASE_URL` | your public HTTPS URL (ngrok in dev, no trailing slash) |
| `TWILIO_VALIDATE_SIGNATURE` | `false` for first local tests, `true` before production |

Set `MOCK_MODE=false` so the app uses these instead of the in-memory store.
`APP_BASE_URL` must exactly match the webhook URL you set in Twilio, including
`https` and no trailing slash. Signature validation hashes that URL, so a mismatch
makes valid requests fail once validation is on.

### 3. Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Visit `/dashboard`. With the seed loaded it shows the demo business and empty tables.

### 4. Expose to Twilio with ngrok

Twilio must reach your machine over public HTTPS.

```bash
ngrok http 3000
```

Copy the `https://....ngrok-free.app` URL into `.env.local` as `APP_BASE_URL`, then
restart `npm run dev`.

### 5. Twilio console configuration

1. Buy a number (or use a trial number) with Voice enabled.
2. Phone Numbers → your number → Voice Configuration.
3. **A call comes in** → Webhook →
   `https://<your-ngrok>.ngrok-free.app/api/twilio/voice/incoming` → HTTP POST.
4. Save. The `dial-result` callback is set by the TwiML itself; no console step needed.

On a Twilio trial account you can only forward to verified numbers, and calls open
with a trial notice. Both are fine for the demo.

### 6. MVP 1 success test

1. Call your Twilio number from another phone.
2. It greets you and rings the route phone.
3. Answer it → dashboard shows the call as **Answered** with a duration.
4. Repeat and **ignore** the call → after the dial timeout the dashboard shows it as
   **Missed**, and a "Missed call callback" appears in the callback queue with a due time.

That is the spine: inbound call → log → route → missed → request → dashboard.

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
