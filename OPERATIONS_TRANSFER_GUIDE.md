# AI Rental Office Assistant — Operations & Transfer Guide

_Last updated: July 2026. This is the document a buyer, a new developer, or
future-you needs to run this product from scratch or take it over. Pair it
with ARCHITECTURE_FILE_GUIDE.md (what the code does)._

---

## 1. Every external service this app depends on

The app cannot run without accounts at all of the following. Whoever owns
these accounts owns the product.

| Service | Used for | What lives there |
|---|---|---|
| GitHub (`jdpkumar-hub/ai-rental-saas`) | Source of truth for code | The repo; Vercel deploys from `main` |
| Vercel | Hosting + serverless API routes | The deployment, ALL environment variables, custom domain attachment, (optionally cron) |
| Supabase | Database (Postgres) | Every table: companies, users, calls, leads, pricing_plans, company_settings, twilio_numbers, inquiries…; migrations are run in its SQL editor |
| Stripe | Subscriptions, setup fee, overage billing | Products/Prices (per mode), customers, subscriptions, webhook endpoints + signing secrets, Customer Portal config |
| Twilio | Phone numbers + speech recognition | Every tenant phone number; each number's "A Call Comes In" webhook must point at `<app-url>/api/voice/incoming` |
| OpenAI | The agent's brain | Just an API key with billing enabled |
| Gmail (SMTP) | All transactional email | `GMAIL_USER` + an app password (`GMAIL_APP_PASSWORD`) |
| Domain registrar | `rentalofficeassistant.com` (purchased, not yet attached) | DNS; attach in Vercel → Settings → Domains at go-live |

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

Every variable below must exist in Production (and Preview if you test
there). **Changing any of them does nothing until you redeploy.**

| Variable | What it is / where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page (public/anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page — SECRET, bypasses all row security; server-only |
| `SESSION_SECRET` | Any long random string; signs both session JWTs. Rotating it logs everyone out. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys. `sk_test_…` now; swap to `sk_live_…` at go-live |
| `STRIPE_PUBLISHABLE_KEY` | Same page |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint → Signing secret (`whsec_…`). DIFFERENT per endpoint and per mode — a new live endpoint means a new secret |
| `OPENAI_API_KEY` | OpenAI dashboard |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio Console home |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | The sending Gmail address + an App Password (Google Account → Security → 2-Step Verification → App passwords) |
| `NEXT_PUBLIC_APP_URL` | Set at go-live to `https://rentalofficeassistant.com` |

## 3. From-zero setup (buyer with brand-new accounts, or disaster recovery)

1. Create accounts at every service in section 1.
2. Fork/clone the repo; connect it to a Vercel project (framework: Next.js, deploys from `main`).
3. Create a Supabase project; run every migration file in order (0001 → 0019) in the SQL editor.
4. Set every env var from section 2 in Vercel; deploy.
5. Stripe (test mode first): in platform-admin run **Sync to Stripe** (creates Products/Prices from `pricing_plans`); create a webhook endpoint at `<app-url>/api/billing/webhook`, API version `2026-06-24.dahlia`, events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.upcoming`, `invoice.payment_failed`; copy its `whsec_…` into `STRIPE_WEBHOOK_SECRET`; activate the Customer Portal (Settings → Billing → Customer portal); **redeploy**.
6. Twilio: buy a number; set its Voice "A Call Comes In" webhook to `POST <app-url>/api/voice/incoming`.
7. Create a platform-admin user (per the Phase 1 seed procedure / directly in the DB), log in to `/platform-admin`.
8. Create a test company + user + attach the Twilio number; set greeting and voice in company settings.
9. Smoke test: call the number (full conversation → lead appears in CRM, transcript in Call History, full-call recording plays); expire the trial in SQL → forced to `/billing` → pay with `4242 4242 4242 4242` → dashboard restored, webhook shows 200 in Stripe, `stripe_subscription_id` + `setup_fee_paid_at` populated; set `call_limit = 0` → one call → $0.99 pending invoice item on the Stripe customer → restore the limit.
10. Set up a warm-up ping (cron-job.org or similar hitting a health endpoint every 5 minutes) so the first call of the day isn't slow.

## 4. Go-live cutover (test money → real money)

Attach `rentalofficeassistant.com` in Vercel → Settings → Domains and update
DNS at the registrar. Swap `STRIPE_SECRET_KEY` to the live `sk_live_…` key.
Create a NEW live-mode webhook endpoint at
`https://rentalofficeassistant.com/api/billing/webhook` with the same six
events and API version — live and test webhooks are separate — and put its
new `whsec_…` into `STRIPE_WEBHOOK_SECRET`. Activate the Customer Portal in
live mode. Re-run **Sync to Stripe** (the live account starts empty). Set
`NEXT_PUBLIC_APP_URL=https://rentalofficeassistant.com`. Redeploy. Update
every Twilio number's webhook to the custom domain. Charge one real card and
refund it.

## 5. Selling / transferring the product

There are two shapes of sale; the checklist differs.

### 5a. Selling the whole running business (accounts transfer with it)

Transfer ownership of: the GitHub repo, the Vercel project (or team), the
Supabase organization/project, the Stripe account (Stripe supports account
ownership transfer — this preserves customers, subscriptions, and billing
history, which is the whole point), the Twilio account or at minimum the
phone numbers (Twilio supports number porting between accounts; if the
account moves, tenant numbers keep working untouched), the domain, and the
OpenAI account (or the buyer swaps in their own key — nothing is stored
there). Replace the Gmail sender with the buyer's address
(`GMAIL_USER`/`GMAIL_APP_PASSWORD`) and redeploy. Then rotate EVERY secret
the seller ever saw: `SESSION_SECRET`, Supabase service-role key, Stripe
keys + webhook secret, Twilio auth token, OpenAI key, Gmail app password —
update each in Vercel and redeploy. Hand over this document, the
architecture guide, and platform-admin credentials (buyer changes the
password immediately).

### 5b. Selling the code only (buyer runs their own instance)

The buyer follows section 3 with entirely fresh accounts. Things they must
change or provide themselves: their own domain (`NEXT_PUBLIC_APP_URL`, the
go-live webhook URL, Twilio webhooks), their own Stripe account (their
prices sync from `pricing_plans` — they set their own numbers in
platform-admin), their own Twilio numbers, their own sender email, and any
branding baked into the landing page / login screens (colors and logos are
editable in platform-admin; product name appears in landing copy and email
templates — search the repo for the product name to find every spot). No
tenant data transfers in this model.

### 5c. Rebranding checklist (either model)

Landing page copy and colors (admin landing tab + landing components), login
screen backgrounds (admin site-settings card), email templates' wording
(grep the API routes that call `sendEmail`), the default brand color, the
domain, and the greeting templates you suggest to tenants. The per-tenant
branding (logo, color, greeting, voice) is all data, not code — it moves
with the database.

## 6. Routine operations

**Onboarding a tenant (current manual flow):** create the company + first
user in platform-admin, set trial end (14-day button), set plan +
`call_limit` (100 Starter / 300 Portfolio) and setup fee (default $999, or
Waive), buy/assign a Twilio number and point its webhook at
`/api/voice/incoming`, set their greeting + voice (Ruth) in settings, place
a test call, send them their login.

**Changing prices:** Pricing tab (monthly auto-derives quarterly/yearly) →
Sync to Stripe → verify one checkout shows the new amount. Existing
subscribers keep their old price until you migrate them in the Stripe
Dashboard (subscription → Update → new price → no proration); notify
customers ~30 days before an increase.

**Monthly checks:** Stripe webhook deliveries all 200 (Developers →
Webhooks); failed payments handled; usage-alert emails reviewed; Vercel and
Supabase usage within plan; OpenAI/Twilio spend vs revenue per tenant.

**Secrets hygiene:** rotate any key that may have leaked immediately
(update in the source service AND in Vercel env AND redeploy — all three,
every time).
