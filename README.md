# AI Rental Office Assistant — Phase 1: Multi-Tenant Foundation

This is the foundation layer for the full product roadmap: multi-tenant
database structure, company-scoped authentication, and a dashboard shell
that proves tenant isolation actually works before any voice/AI features
are layered on top.

## What's included in this delivery

- **Database schema** (`supabase/migrations/`): `companies`, `users`,
  `company_settings`, all scoped by `company_id`, with **Postgres Row
  Level Security (RLS)** enabled so isolation is enforced at the database
  layer, not just in application code.
- **Auth**: 3-field login (Company / Email / Password) exactly as
  specified, using bcrypt password hashing and signed JWT sessions in an
  httpOnly cookie.
- **Dashboard shell**: a real page, protected by middleware, that reads
  back the logged-in company's own settings and user count — this is the
  proof that two different companies see two different datasets through
  the exact same code path.
- **Seed data**: two demo companies (Sterling Heights, Lakehurst
  Apartments) so you can log in as either one and see the isolation for
  yourself immediately.

## Why Row Level Security, specifically

You asked for "every table will reference `company_id` — this is what
makes it multi-tenant." That's necessary but not sufficient on its own:
if any future API route (and there will be dozens, across Phases 2–7)
forgets a `.eq('company_id', ...)` filter, that's a data leak between
your customers — the single most damaging kind of bug a multi-tenant
SaaS can ship. RLS makes that class of bug structurally impossible: the
database itself refuses to return rows outside the current tenant,
regardless of what the application code does or forgets to do. It costs
a bit more setup now and pays for itself the first time someone forgets
a filter in Phase 5.

## Setup

### 1. Create a Supabase project (if you haven't already)

Go to [supabase.com](https://supabase.com), create a project, and grab
three values from **Project Settings → API**:
- Project URL
- `anon` public key
- `service_role` secret key (⚠️ never expose this in client-side code)

### 2. Run the migrations

In the Supabase dashboard, open **SQL Editor** and run, in order:
1. `supabase/migrations/0001_phase1_foundation.sql`
2. `supabase/migrations/0002_tenant_context_rpc.sql`
3. `supabase/seed.sql` (optional, but recommended — adds the two demo
   companies so you can test isolation immediately)

(If you prefer the CLI: `supabase db push` after linking your project,
or `psql` directly against the connection string — either works since
these are plain `.sql` files.)

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the three Supabase values, and generate a session secret:

```bash
openssl rand -base64 32
```

Paste that into `SESSION_SECRET`.

### 4. Install and run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — it'll redirect you to `/login`.

### 5. Test the isolation

Log in twice, in two different browser sessions (or one normal + one
incognito window):

| Company    | Email                  | Password      |
|------------|-------------------------|---------------|
| `sterling` | admin@sterling.com      | password123   |
| `lakehurst`| manager@lakehurst.com   | password123   |

Each dashboard will show that company's own settings and user count.
Neither can see the other's data — try changing the `company` field to
the wrong tenant with the right email/password and confirm it's
rejected.

## How the pieces fit together (for whoever maintains this next)

```
Browser
  │  POST /api/auth/login  { company, email, password }
  ▼
src/lib/auth.ts          → looks up company by company_code,
                            then user within that company,
                            verifies bcrypt password
  │
  ▼
src/lib/session.ts       → signs a JWT { userId, companyId, role, ... }
                            sets it as an httpOnly cookie
  │
  ▼
src/middleware.ts        → on every /dashboard/* request, verifies the
                            JWT and redirects to /login if missing/invalid
  │
  ▼
src/lib/supabaseAdmin.ts → getTenantClient(companyId) opens a Postgres
                            session and calls set_tenant_context(), which
                            RLS policies use to filter every query
  │
  ▼
Any data route           → queries normally; RLS guarantees tenant
(/api/company-settings,    isolation even without an explicit filter
 future /api/leads, etc.)
```

## What's intentionally NOT in this delivery

This is Phase 1 only, per your roadmap. Not included yet (next phases):
- Twilio voice webhook + Whisper/GPT call pipeline (Phase 2)
- Call history, recordings, transcripts (Phase 3)
- Real-time analytics dashboard (Phase 4)
- Leasing CRM (Phase 5)
- AI-generated insights (Phase 6)
- Branding, billing (Stripe), multi-Twilio-number support, SMS/email
  notifications, role management UI (Phase 7)

## A note on scope

Worth saying directly: the full roadmap you outlined (Phases 1–7) is a
multi-week build for a small team, even with AI-assisted development —
it touches telephony infrastructure, a real-time AI pipeline, billing,
and a full CRM. I'd suggest treating each phase as its own delivery:
get Phase 1 deployed and working against your real Supabase project
first, then come back for Phase 2 (the Twilio/Whisper/GPT voice engine)
as a separate, focused build. That'll surface integration issues (API
keys, webhook URLs, Twilio account setup) early instead of all at once.
