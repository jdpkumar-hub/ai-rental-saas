import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentMonthStartIso } from "@/lib/callUsage";

export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/overview
//
// Cross-tenant activity monitor for the admin Overview tab: per company,
// calls today / last 7 days / this calendar month, leads this month,
// hot leads (lease probability >= 70), monthly cap, and last call time.
// Computed from a single 90-day pull of calls + this month's leads, so
// it stays a handful of queries regardless of company count.
// ----------------------------------------------------------------------------
export async function GET() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now - 7 * dayMs);
  const ninetyDaysAgo = new Date(now - 90 * dayMs);
  const monthStart = currentMonthStartIso();

  const { data: companies, error: companiesError } = await supabaseAdmin
    .from("companies")
    .select("id, company_name, company_code, status, subscription_plan, call_limit")
    .order("company_name", { ascending: true });

  if (companiesError) {
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const { data: calls, error: callsError } = await supabaseAdmin
    .from("calls")
    .select("company_id, created_at")
    .gte("created_at", ninetyDaysAgo.toISOString());

  if (callsError) {
    return NextResponse.json({ error: callsError.message }, { status: 500 });
  }

  // Leads this month. lease_probability powers the "hot" count; if that
  // column is named differently in this deployment, fall back gracefully
  // to counting leads without a hot breakdown.
  let leads: Array<{ company_id: string; lease_probability?: number | null }> = [];
  {
    const attempt = await supabaseAdmin
      .from("leads")
      .select("company_id, lease_probability")
      .gte("created_at", monthStart);
    if (!attempt.error) {
      leads = attempt.data ?? [];
    } else {
      const fallback = await supabaseAdmin
        .from("leads")
        .select("company_id")
        .gte("created_at", monthStart);
      leads = fallback.data ?? [];
    }
  }

  const rows = (companies ?? []).map((c) => {
    const companyCalls = (calls ?? []).filter((k) => k.company_id === c.id);
    const companyLeads = leads.filter((l) => l.company_id === c.id);

    let lastCallAt: string | null = null;
    let callsToday = 0;
    let calls7d = 0;
    let callsMonth = 0;

    for (const k of companyCalls) {
      const t = new Date(k.created_at);
      if (!lastCallAt || k.created_at > lastCallAt) lastCallAt = k.created_at;
      if (t >= todayStart) callsToday++;
      if (t >= sevenDaysAgo) calls7d++;
      if (k.created_at >= monthStart) callsMonth++;
    }

    return {
      company_id: c.id,
      company_name: c.company_name,
      company_code: c.company_code,
      status: c.status,
      subscription_plan: c.subscription_plan,
      call_limit: c.call_limit ?? null,
      calls_today: callsToday,
      calls_7d: calls7d,
      calls_month: callsMonth,
      leads_month: companyLeads.length,
      hot_leads: companyLeads.filter(
        (l) => typeof l.lease_probability === "number" && l.lease_probability >= 70
      ).length,
      last_call_at: lastCallAt,
    };
  });

  return NextResponse.json({ companies: rows });
}
