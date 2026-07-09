import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getTenantClient, supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentMonthStartIso } from "@/lib/callUsage";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Pull this company's own settings + a row count, using the tenant-scoped
  // client. getTenantClient() applies .eq('company_id', ...) automatically
  // to every query, so this is here mainly to prove the isolation: log in
  // as two different demo companies and you'll see this card reflect only
  // the logged-in company's own data, every time.
  const tenantDb = await getTenantClient(session.companyId);

  const { data: settings, error: settingsError } = await tenantDb
    .from("company_settings")
    .select("*")
    .single();

  if (settingsError) {
    console.error("[dashboard] company_settings query failed:", settingsError);
  }

  const { count: userCount, error: userCountError } = await tenantDb
    .from("users")
    .select("*", { count: "exact", head: true });

  if (userCountError) {
    console.error("[dashboard] users count query failed:", userCountError);
  }

  // Monthly call usage for the "Calls this month" card. Counted exactly
  // the way the voice pipeline counts against the cap: calls created
  // since the start of the current calendar month. The limit + overage
  // price live on the companies row, which (per the tenancy rules) is
  // read via supabaseAdmin filtered by the verified session companyId —
  // never via request input.
  const monthStart = currentMonthStartIso();

  const { data: companyRow, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("call_limit, overage_price_cents")
    .eq("id", session.companyId)
    .maybeSingle();

  if (companyError) {
    console.error("[dashboard] company usage lookup failed:", companyError);
  }

  const { count: callsThisMonth, error: callsCountError } = await tenantDb
    .from("calls")
    .select("*", { count: "exact", head: true })
    .gte("created_at", monthStart);

  if (callsCountError) {
    console.error("[dashboard] calls count query failed:", callsCountError);
  }

  const { count: overageCalls, error: overageCountError } = await tenantDb
    .from("calls")
    .select("*", { count: "exact", head: true })
    .eq("is_overage", true)
    .gte("created_at", monthStart);

  if (overageCountError) {
    console.error("[dashboard] overage count query failed:", overageCountError);
  }

  return (
    <DashboardClient
      session={session}
      settings={settings}
      userCount={userCount ?? 0}
      callUsage={{
        used: callsThisMonth ?? 0,
        overage: overageCalls ?? 0,
        limit: companyRow?.call_limit ?? null,
        overagePriceCents: companyRow?.overage_price_cents ?? 99,
      }}
    />
  );
}
