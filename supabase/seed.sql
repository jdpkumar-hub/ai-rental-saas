-- ============================================================================
-- Demo seed data — two separate companies, to prove multi-tenant isolation.
-- Run this AFTER 0001_phase1_foundation.sql
--
-- Login credentials for testing:
--   Company: sterling   | Email: admin@sterling.com    | Password: password123
--   Company: lakehurst  | Email: manager@lakehurst.com  | Password: password123
--
-- The password hash below is a real bcrypt hash of "password123" (cost 10).
-- ============================================================================

insert into companies (company_name, company_code, email, phone, subscription_plan, status)
values
  ('Sterling Heights Apartments', 'sterling',  'admin@sterling.com',   '555-0100', 'pro',   'active'),
  ('Lakehurst Apartments',        'lakehurst', 'manager@lakehurst.com','555-0200', 'trial', 'active')
on conflict (company_code) do nothing;

-- Sterling Heights admin user
insert into users (company_id, name, email, password_hash, role, active)
select id, 'Sterling Admin', 'admin@sterling.com',
       '$2b$10$5sD7ENVCQOUQaj.S3.QDbeBG.ZMhOJtirQajBLY0fzsBLuDQTSxa.',
       'admin', true
from companies where company_code = 'sterling'
on conflict (company_id, email) do nothing;

-- Lakehurst manager user
insert into users (company_id, name, email, password_hash, role, active)
select id, 'Lakehurst Manager', 'manager@lakehurst.com',
       '$2b$10$5sD7ENVCQOUQaj.S3.QDbeBG.ZMhOJtirQajBLY0fzsBLuDQTSxa.',
       'manager', true
from companies where company_code = 'lakehurst'
on conflict (company_id, email) do nothing;

-- company_settings rows are auto-created by the trigger in the migration,
-- so nothing else to seed for Phase 1.
