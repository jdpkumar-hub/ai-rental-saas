-- ============================================================================
-- Phase 1 (cont.) — RPC function to set tenant context for RLS
-- ============================================================================
-- Supabase's client library can't run a raw `SET` / `SELECT set_config(...)`
-- statement directly, so we expose it as a Postgres function and call it
-- via `.rpc()` from the server-side Supabase client (see
-- src/lib/supabaseAdmin.ts -> getTenantClient).
--
-- SECURITY NOTE: This function is intentionally simple — it just sets a
-- session variable. The actual access control still lives in the RLS
-- policies themselves (company_isolation, users_isolation, etc.), which
-- compare every row against whatever this function set. The application
-- layer (src/lib/auth.ts) is responsible for only ever calling this with
-- a companyId that was verified from a signed session token — never from
-- raw, unvalidated user input.
-- ============================================================================

create or replace function set_tenant_context(company_id_input uuid)
returns void as $$
begin
  perform set_config('app.current_company_id', company_id_input::text, false);
end;
$$ language plpgsql security definer;
