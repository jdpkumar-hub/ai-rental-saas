-- ============================================================================
-- AI Rental Office Assistant SaaS — Phase 1: Multi-Tenant Foundation
-- ============================================================================
-- This migration creates the core tenancy structure:
--   companies          -> one row per customer ("tenant")
--   users              -> staff logins, always scoped to a company
--   company_settings   -> per-company config (greeting, hours, voice, etc.)
--
-- KEY DECISION: We enforce tenant isolation at TWO layers:
--   1. Application layer  -> every query includes WHERE company_id = ...
--   2. Database layer     -> Postgres Row Level Security (RLS) policies
--
-- Layer 2 is the safety net. If a bug in app code ever forgets a company_id
-- filter, RLS still prevents cross-tenant data leaks. This is the standard
-- pattern for serious multi-tenant SaaS on Supabase/Postgres.
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- companies  (the tenants)
-- ----------------------------------------------------------------------------
create table if not exists companies (
  id                uuid primary key default gen_random_uuid(),
  company_name      text not null,
  company_code      text not null unique,        -- short slug used at login, e.g. "sterling"
  email             text not null,
  phone             text,
  twilio_number     text,
  subscription_plan text not null default 'trial', -- trial | starter | pro | enterprise
  status            text not null default 'active', -- active | suspended | cancelled
  logo_url          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_companies_company_code on companies (company_code);

-- ----------------------------------------------------------------------------
-- users  (staff logins — every user belongs to exactly one company)
-- ----------------------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  email         text not null,
  password_hash text not null,
  role          text not null default 'agent', -- admin | manager | agent
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- email must be unique PER COMPANY, not globally —
  -- two different companies can each have an "admin@..." style user
  constraint uq_users_company_email unique (company_id, email)
);

create index if not exists idx_users_company_id on users (company_id);

-- ----------------------------------------------------------------------------
-- company_settings  (1-to-1 config row per company)
-- ----------------------------------------------------------------------------
create table if not exists company_settings (
  company_id     uuid primary key references companies(id) on delete cascade,
  greeting       text not null default 'Thanks for calling! How can I help you today?',
  business_hours jsonb not null default '{
    "mon": {"open": "09:00", "close": "18:00"},
    "tue": {"open": "09:00", "close": "18:00"},
    "wed": {"open": "09:00", "close": "18:00"},
    "thu": {"open": "09:00", "close": "18:00"},
    "fri": {"open": "09:00", "close": "18:00"},
    "sat": {"open": "10:00", "close": "14:00"},
    "sun": null
  }'::jsonb,
  voice          text not null default 'alloy',
  timezone       text not null default 'America/Chicago',
  sms_enabled    boolean not null default false,
  email_enabled  boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at auto-touch trigger (small QoL helper, reused by later phases too)
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_companies_updated_at on companies;
create trigger trg_companies_updated_at
  before update on companies
  for each row execute function set_updated_at();

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_company_settings_updated_at on company_settings;
create trigger trg_company_settings_updated_at
  before update on company_settings
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-create a default company_settings row whenever a company is created
-- ----------------------------------------------------------------------------
create or replace function create_default_company_settings()
returns trigger as $$
begin
  insert into company_settings (company_id) values (new.id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_create_default_settings on companies;
create trigger trg_create_default_settings
  after insert on companies
  for each row execute function create_default_company_settings();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- We read the current user's company_id from a Postgres session variable
-- (app.current_company_id), which our API layer sets at the start of every
-- authenticated request using set_config(). This means even raw SQL run
-- through the Supabase client cannot accidentally cross tenant boundaries.
-- ----------------------------------------------------------------------------

create or replace function current_company_id()
returns uuid as $$
  select coalesce(
    current_setting('app.current_company_id', true),
    ''
  )::uuid
$$ language sql stable;

alter table companies enable row level security;
alter table users enable row level security;
alter table company_settings enable row level security;

-- companies: a logged-in user may only ever see their OWN company row.
-- (Inserting new companies / signup is done via the service role key,
--  which bypasses RLS — see src/lib/supabaseAdmin.ts)
drop policy if exists company_isolation on companies;
create policy company_isolation on companies
  using (id = current_company_id());

drop policy if exists users_isolation on users;
create policy users_isolation on users
  using (company_id = current_company_id());

drop policy if exists settings_isolation on company_settings;
create policy settings_isolation on company_settings
  using (company_id = current_company_id());

-- ============================================================================
-- Seed: two demo companies so you can prove isolation works immediately
-- Password for both demo users is: "password123"
-- (bcrypt hash generated at seed time — see seed.sql comment below)
-- ============================================================================
-- Seeding is intentionally left to supabase/seed.sql so it can be re-run
-- independently of schema migrations.
