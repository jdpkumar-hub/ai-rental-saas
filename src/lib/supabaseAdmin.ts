import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ----------------------------------------------------------------------------
// ADMIN CLIENT — uses the service role key, which BYPASSES Row Level Security.
//
// Only ever import this in server-side code (API routes), and only use it
// for operations that legitimately need to cross tenant boundaries:
//   - Looking up a company by company_code during login (before we know
//     who the user is yet, there's no company_id to scope by)
//   - Creating a brand-new company during signup
//
// For every other query (reading/writing data on behalf of a logged-in
// user), use `getTenantClient(companyId)` below instead.
// ----------------------------------------------------------------------------
export const supabaseAdmin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ----------------------------------------------------------------------------
// TENANT-SCOPED CLIENT (v2 — explicit filtering, not session state)
//
// HISTORY / WHY THIS CHANGED:
// The original version of this function tried to set a Postgres session
// variable (via a `set_tenant_context` RPC call) and rely on Row Level
// Security policies to filter every subsequent query automatically. That
// approach broke in production-like conditions: Supabase's connection
// pooling (PgBouncer in transaction mode) does not guarantee that the
// RPC call and the following `.from(...)` query run on the same
// underlying Postgres connection. Session-scoped `set_config()` does not
// survive across that boundary, so the RLS filter silently failed to
// apply — confirmed via the PGRST116 "result contains 2 rows" error
// during testing, which means a user briefly saw a different company's
// settings merged into their own dashboard.
//
// FIX: stop depending on connection-level session state entirely. Every
// query made through this wrapper has an explicit `.eq('company_id', X)`
// applied by code, not by an implicit Postgres session variable. This is
// the same protection conceptually but doesn't depend on connection
// pooling behavior.
//
// `companyId` here must ALWAYS come from a value you've already verified
// server-side (i.e. decoded from the signed session JWT in
// src/lib/session.ts) — never from raw request input — since this
// wrapper uses the service-role key and therefore bypasses RLS.
//
// RLS policies remain ENABLED in the database (see migration 0001) as a
// defense-in-depth measure for any other access path (e.g. the anon-key
// client in src/lib/supabasePublic.ts, or a future direct DB connection)
// even though this particular wrapper no longer depends on them.
// ----------------------------------------------------------------------------

// NOTE ON TYPES: Supabase's query builder generics are extremely deep
// (they vary per-call based on .select()/.update()/.eq() chains), and
// trying to precisely mirror that here causes TypeScript to either
// reject valid chains or blow its instantiation depth limit. We use
// `any` for the return value of this wrapper's methods specifically —
// the actual safety property (the company_id filter) is enforced by the
// implementation below, not by the type checker, so this is a deliberate
// and contained trade-off rather than a general escape hatch.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TenantClient {
  /**
   * Same as supabase.from(table), but every query built from the
   * returned object is automatically filtered to this tenant's
   * company_id. Works for select/update/delete; for insert, company_id
   * is merged into the payload automatically.
   */
  from: (table: string) => {
    select: (
      columns?: string,
      options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }
    ) => any;
    update: (values: Record<string, unknown>) => any;
    delete: () => any;
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => any;
  };
  companyId: string;
}

export async function getTenantClient(companyId: string): Promise<TenantClient> {
  if (!companyId) {
    throw new Error("getTenantClient called without a companyId");
  }

  return {
    companyId,
    from(table: string) {
      return {
        select(
          columns = "*",
          options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }
        ) {
          return supabaseAdmin
            .from(table)
            .select(columns, options)
            .eq("company_id", companyId);
        },
        update(values: Record<string, unknown>) {
          // Never allow company_id itself to be overwritten via update payloads
          const { company_id: _ignored, ...safeValues } = values;
          return supabaseAdmin
            .from(table)
            .update(safeValues)
            .eq("company_id", companyId);
        },
        delete() {
          return supabaseAdmin.from(table).delete().eq("company_id", companyId);
        },
        insert(values: Record<string, unknown> | Record<string, unknown>[]) {
          const withCompanyId = Array.isArray(values)
            ? values.map((v) => ({ ...v, company_id: companyId }))
            : { ...values, company_id: companyId };
          return supabaseAdmin.from(table).insert(withCompanyId);
        },
      };
    },
  };
}
