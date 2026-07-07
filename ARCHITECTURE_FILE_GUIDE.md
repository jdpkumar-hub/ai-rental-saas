# AI Rental Office Assistant — Architecture & File Guide

_Last updated: July 2026 (post call-cap/overage build). Keep this file in the
repo root and update it whenever files are added or responsibilities move._

This document answers two questions: **what does each file do**, and **which
file do I edit to change a given behavior**. It complements
PROJECT_HANDOFF2.md (which records project *state*); this records project
*structure*.

---

## 1. The stack in one paragraph

Next.js 14 (App Router) hosted on Vercel. Supabase (Postgres) is the only
database; every tenant's data lives in shared tables separated by a
`company_id` column. Twilio provides the phone numbers and speech
recognition; OpenAI (GPT-4o-mini) decides what the voice agent says and
extracts lead fields; Amazon Polly Generative voices (via Twilio `<Say>`)
speak the responses. Stripe handles subscriptions, the one-time setup fee,
and per-call overage billing. Gmail SMTP sends transactional email. There is
no separate backend server — every piece of server logic is a Next.js API
route under `src/app/api/`.

## 2. Non-negotiable conventions (break these and things silently fail)

The URL of every page and API route IS its folder path under `src/app`, and
an API route's file must be named exactly `route.ts` — a file named anything
else is invisible to Next.js. Environment variable changes on Vercel do
nothing until you REDEPLOY. Stripe Price objects are immutable: "changing a
price" always means creating a new Price and re-pointing new checkouts at it
(that is what Sync to Stripe does). Test-mode and live-mode Stripe are two
separate worlds — products, prices, webhooks, and portal config must each be
created again in live mode. `companyId` used in any database query must come
from the verified session, never from request input.

## 3. File-by-file reference

### 3.1 Voice pipeline (the phone agent)

| File | Purpose |
|---|---|
| `src/app/api/voice/incoming/route.ts` | First webhook Twilio hits when a call comes in. Maps the dialed number → company (via `twilio_numbers`), loads greeting/voice settings, counts this month's calls against `companies.call_limit` and flags the call `is_overage` if past the cap (soft cap — call is still answered), inserts the `calls` row with the system prompt as GPT context, returns greeting TwiML. Not behind auth — Twilio calls it directly. |
| `src/app/api/voice/turn/route.ts` | The conversation loop. Twilio POSTs the caller's transcribed speech (`SpeechResult` from `<Gather>`) here after every turn. Appends it to the conversation, calls GPT, merges extracted fields into the `leads` row, recomputes lease probability, updates the `calls` row, and returns TwiML for the next question — or the closing message when the lead is complete. |
| `src/app/api/voice/recording-complete/route.ts` | Fires once per call, after the call ends and the whole-call recording is processed. Saves `full_call_recording_url` (powers "Play full call"), creates the $0.99 Stripe InvoiceItem for overage-flagged calls (idempotent via `overage_invoice_item_id`), and emails the platform owner at 80%/100% of a company's monthly cap. |
| `src/lib/twiml.ts` | All TwiML (Twilio XML) generation. Owns the voice map (simple names like `ruth` → `Polly.Ruth-Generative`), the `<Gather>` speech-recognition settings (`speechTimeout="2"`, model, barge-in behavior), the uninterruptible greeting, silence recovery ("Are you still there?"), closing, and error fallback. **This is the file for anything about how the agent *sounds* mechanically** — voice, timing, interruptions. |
| `src/lib/leadExtraction.ts` | The agent's brain/personality. `buildSystemPrompt()` is the full GPT system prompt: tone, spoken-English style rules, the five required lead fields, conversation rules, closing behavior, JSON response contract. Also `isLeadComplete()` / `getMissingFields()`. **This is the file for anything about what the agent *says*.** |
| `src/lib/openai.ts` | Thin fetch wrapper for OpenAI. `runConversationTurn()` (model = gpt-4o-mini, temperature 0.7, JSON response format) and the now-unused `transcribeAudio()` (Whisper — kept for rollback to the old Record-based pipeline). |
| `src/lib/callUsage.ts` | Call-cap logic: monthly call counting (calendar month), `isOverageCall()`, and `billOverageCall()` which creates the Stripe InvoiceItem that rides the customer's next invoice. |
| `src/lib/leaseScore.ts` | Lease-probability scoring for leads, recomputed every turn. |

### 3.2 Auth, sessions, tenancy

| File | Purpose |
|---|---|
| `src/lib/session.ts` | Tenant (company user) sessions: signed JWT in httpOnly cookie `session`, payload `{ userId, companyId, companyCode, role, name, email }`. `getSession()` reads it. |
| `src/lib/platformAdminSession.ts` | YOUR (platform owner) session — completely separate cookie `platform_admin_session`. `getPlatformAdminSession()`. |
| `src/lib/requireTenant.ts` | Guard for tenant-authenticated API routes. |
| `src/lib/requirePlatformAdmin.ts` | Guard for platform-admin API routes. |
| `src/lib/requireActiveAccess.ts` | The access verdict: active subscription OR unexpired trial → allowed; otherwise redirect to `/billing`. Called by the dashboard layout on every load. Note: LOGIN is governed by `companies.status === 'active'`; ACCESS is governed here — two different gates. |
| `src/lib/trialStatus.ts` | Trial expiry math from `companies.trial_started_at` / `trial_ends_at`. |
| `src/lib/supabaseAdmin.ts` | `supabaseAdmin` = service-role client (bypasses RLS, server-only). `getTenantClient(companyId)` auto-filters every child-table query by `company_id`. The `companies` table itself is read via `supabaseAdmin` filtered by the session's companyId. |

### 3.3 Billing (Stripe)

| File | Purpose |
|---|---|
| `src/app/api/platform-admin/stripe-sync/route.ts` | "Sync to Stripe" button. For each active plan: creates the Stripe Product (once) and three new Prices (monthly/quarterly/yearly) from `pricing_plans` values, writes IDs back. Warns (without blocking) when quarterly/yearly deviate >5% from the 15%/30% pattern. Must be re-run after ANY price change, and again from scratch in live mode at go-live. |
| `src/app/api/billing/create-checkout-session/route.ts` | Tenant-facing checkout. Creates/reuses the Stripe customer, builds a Checkout session with the subscription line item plus (when owed) the one-time setup-fee line item (a second `line_items` entry — NOT `add_invoice_items`, which the dahlia API rejects on checkout). Does NOT mark the company paid — the webhook does. |
| `src/app/api/billing/webhook/route.ts` | Stripe → app events. `checkout.session.completed` activates the company + stamps `setup_fee_paid_at` (and should set `call_limit` from `pricing_plans.included_calls` — see Open wiring below); `subscription.updated/deleted` sync status; `invoice.upcoming` sends the renewal-reminder email; `invoice.payment_failed` sends a failure email. Verifies the raw-body signature with `STRIPE_WEBHOOK_SECRET`. Reads `current_period_end` from `subscription.items.data[0]` (moved there in dahlia). |
| `src/app/api/billing/portal/route.ts` | Opens a Stripe Customer Portal session (self-serve cancel/update card). Portal must be activated in Stripe settings per mode (test/live). |
| `src/lib/stripe.ts` | The Stripe client, API version pinned to `2026-06-24.dahlia`. npm package v22.x. |
| `src/lib/billingStatus.ts` | Human-readable billing status for the Settings card. |
| `src/app/billing/page.tsx` + `BillingClient.tsx` | The plan/cycle picker page tenants land on when the trial expires. Redirects to `/dashboard` on `?status=success`, shows the setup-fee notice, injects brand color. |

### 3.4 Platform admin (your control panel)

| File | Purpose |
|---|---|
| `src/app/platform-admin/PlatformAdminClient.tsx` | The whole admin UI: company editor (status, plan, trial buttons, setup fee + Waive, monthly call limit + Unlimited, overage price, logo/branding, Twilio numbers), pricing-plan editor (monthly fee auto-derives quarterly at 15% off and yearly at 30% off — both overridable), inquiries, landing-page settings, test-email card. |
| `src/app/api/platform-admin/companies/[id]/route.ts` | PATCH (field allow-list + validation for status, setup fee, call limit, overage price, branding, trial) and DELETE (permanent cascade wipe, requires typing the company code to confirm; prefer PATCH status=cancelled for reversible removal). |
| Other `src/app/api/platform-admin/*` routes | Company list/create, pricing-plans CRUD, Twilio number management, test email — each follows the same `requirePlatformAdmin()` pattern. |

### 3.5 Tenant dashboard

| File | Purpose |
|---|---|
| `src/app/dashboard/layout.tsx` | Wraps every dashboard page; calls `requireActiveAccess` and redirects lapsed accounts to `/billing`. |
| `src/app/dashboard/...` pages | Call History (transcripts, full-call playback), real-time analytics, Leasing CRM (Phase 5), AI Analytics / hot-cold leads (Phase 6). |
| `src/app/dashboard/settings/page.tsx` + `SettingsClient.tsx` + `ManageSubscriptionButton.tsx` | Branding, greeting/voice settings, billing-status card, opens the Stripe portal. |

### 3.6 Shared infrastructure

| File | Purpose |
|---|---|
| `src/lib/email.ts` | `sendEmail({to, subject, html})` via Gmail SMTP (`GMAIL_USER` / `GMAIL_APP_PASSWORD`). Every email in the app goes through this. |
| `supabase migrations 0001…0019` | Schema history. Notables: `0017` Stripe columns, `0018` setup fee, `0019` call limits + overage + setup fee $999 default. Migrations are run manually in the Supabase SQL editor. |

## 4. "I want to change X — which file?"

| Change | Where |
|---|---|
| Greeting text for a company | DATABASE, not code: `company_settings.greeting` (tenant Settings page or SQL). Takes effect on the next call, no deploy. |
| Voice (which Polly voice speaks) | `company_settings.voice` per company (DB); the name→Polly mapping and the default live in `VOICE_MAP` in `src/lib/twiml.ts`. |
| Agent personality, tone, what it asks, closing message | `buildSystemPrompt()` in `src/lib/leadExtraction.ts`. |
| Which lead fields are required | `REQUIRED_LEAD_FIELDS` in `leadExtraction.ts` AND the prompt text AND the `leads` table columns AND the merge logic in `voice/turn/route.ts` — all four together. |
| Speech-recognition timing, barge-in, silence handling | `src/lib/twiml.ts` (`speechTimeout`, `timeout`, gather structure). |
| AI model or creativity | `runConversationTurn()` in `src/lib/openai.ts` (model, temperature). |
| Plan prices | Platform-admin → Pricing tab (monthly auto-fills the others) → **then re-run Sync to Stripe** — displayed price ≠ charged price until synced. |
| Setup fee for one company / default | Per company: admin company editor (or Waive). Default for new companies: DB column default on `companies.setup_fee_cents`. |
| Call cap / overage price | Per company: admin company editor. Plan defaults: `pricing_plans.included_calls`. Overage billing mechanics: `src/lib/callUsage.ts` + `recording-complete` route. |
| Trial length | Set per company at onboarding (`trial_ends_at`); quick buttons in the admin editor. |
| What blocks a lapsed tenant | `src/lib/requireActiveAccess.ts` (dashboard) — note the voice line is NOT yet gated (see below). |
| Email contents (renewal, failure, usage alerts) | The route that sends them (`billing/webhook`, `voice/recording-complete`); transport in `src/lib/email.ts`. |
| Branding/logo/colors per tenant | Tenant Settings page or admin company editor — same DB columns either way. |
| Landing page | Landing components + admin landing-page settings tab. |

## 5. Known open wiring / deliberate v1 limitations

The billing webhook does not yet copy `pricing_plans.included_calls` into
`companies.call_limit` on checkout, so caps are set manually per company
until that ~10-line change ships. Suspended/lapsed tenants' phone numbers
still answer calls (the voice pipeline checks `status === 'active'` but not
subscription/trial state) — costs you OpenAI/Twilio money; a guard in
`voice/incoming` is the fix. Overage InvoiceItems ride the NEXT subscription
invoice, so quarterly/yearly customers accumulate overage until that
invoice; a monthly sweep cron is the eventual fix. Trial companies without a
Stripe customer are flagged for overage but cannot be billed. Per-turn audio
playback no longer exists (turns are text-only since the Gather redesign);
the full-call recording covers playback. The first call after the app idles
is slow until a warm-up ping (external cron hitting a health endpoint) is
set up.
