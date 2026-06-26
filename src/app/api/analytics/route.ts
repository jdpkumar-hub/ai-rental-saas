import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/analytics
//
// Computes every Phase 4 dashboard metric from data the system already
// captures (calls + leads) — no new tracking required. Two metrics from
// the original spec, "Tours Scheduled" and lease conversion, are
// deliberately NOT included here: nothing in the product yet lets an
// agent mark a lead as toured or leased (that's a Phase 5 Leasing CRM
// action), so computing them now would just show a permanent, trust-
// eroding zero. They'll slot in naturally once that UI exists.
//
// Everything below is computed server-side from raw rows rather than
// relying on Postgres aggregate functions through the tenant client
// wrapper, since that wrapper's query builder is typed as `any` (see
// supabaseAdmin.ts) and doesn't support .rpc()-style aggregation cleanly.
// For the data volumes a single rental company will see (hundreds to a
// few thousand calls), pulling raw rows and aggregating in JS is simple,
// correct, and plenty fast — revisit only if a company's call volume
// grows enough that this becomes a real bottleneck.
// ----------------------------------------------------------------------------

type CallRow = {
  id: string;
  status: string;
  duration_seconds: number | null;
  lead_id: string | null;
  created_at: string;
};

type LeadRow = {
  id: string;
  budget: string | null;
  apartment_size: string | null;
  status: string;
  created_at: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data: calls, error: callsError } = await tenantDb
    .from("calls")
    .select("id, status, duration_seconds, lead_id, created_at");

  if (callsError) {
    return NextResponse.json({ error: callsError.message }, { status: 500 });
  }

  const { data: leads, error: leadsError } = await tenantDb
    .from("leads")
    .select("id, budget, apartment_size, status, created_at");

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const callRows = (calls ?? []) as CallRow[];
  const leadRows = (leads ?? []) as LeadRow[];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const isToday = (iso: string) => new Date(iso) >= todayStart;

  // ---- Today's headline metrics ----
  const callsToday = callRows.filter((c) => isToday(c.created_at));
  const leadsToday = leadRows.filter((l) => isToday(l.created_at));
  const missedToday = callsToday.filter(
    (c) => c.status === "failed" || c.status === "abandoned"
  );
  const completedToday = callsToday.filter((c) => c.status === "completed");

  const avgDurationToday =
    completedToday.length > 0
      ? Math.round(
          completedToday.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0) /
            completedToday.length
        )
      : 0;

  const conversionRateToday =
    callsToday.length > 0
      ? Math.round((callsToday.filter((c) => c.lead_id).length / callsToday.length) * 100)
      : 0;

  // ---- 14-day trend: calls per day + leads per day ----
  const dayBuckets: { date: string; calls: number; leads: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    const dayLabel = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const dayEnd = new Date(d);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const callsOnDay = callRows.filter((c) => {
      const t = new Date(c.created_at);
      return t >= d && t < dayEnd;
    }).length;

    const leadsOnDay = leadRows.filter((l) => {
      const t = new Date(l.created_at);
      return t >= d && t < dayEnd;
    }).length;

    dayBuckets.push({ date: dayLabel, calls: callsOnDay, leads: leadsOnDay });
  }

  // ---- Peak call times: hour-of-day histogram (0-23), all-time ----
  const hourCounts = new Array(24).fill(0);
  for (const c of callRows) {
    const hour = new Date(c.created_at).getHours();
    hourCounts[hour]++;
  }

  // ---- Apartment size demand ----
  const sizeCounts: Record<string, number> = {};
  for (const l of leadRows) {
    if (!l.apartment_size) continue;
    const key = normalizeApartmentSize(l.apartment_size);
    sizeCounts[key] = (sizeCounts[key] ?? 0) + 1;
  }

  // ---- Budget distribution (bucketed) ----
  const budgetBuckets: Record<string, number> = {
    "Under $1,000": 0,
    "$1,000–1,499": 0,
    "$1,500–1,999": 0,
    "$2,000–2,999": 0,
    "$3,000+": 0,
    Unspecified: 0,
  };
  for (const l of leadRows) {
    const amount = parseBudget(l.budget);
    if (amount === null) {
      budgetBuckets["Unspecified"]++;
    } else if (amount < 1000) {
      budgetBuckets["Under $1,000"]++;
    } else if (amount < 1500) {
      budgetBuckets["$1,000–1,499"]++;
    } else if (amount < 2000) {
      budgetBuckets["$1,500–1,999"]++;
    } else if (amount < 3000) {
      budgetBuckets["$2,000–2,999"]++;
    } else {
      budgetBuckets["$3,000+"]++;
    }
  }

  // ---- Lead status breakdown (all-time) ----
  const statusCounts: Record<string, number> = {};
  for (const l of leadRows) {
    statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;
  }

  return NextResponse.json({
    today: {
      calls: callsToday.length,
      newLeads: leadsToday.length,
      missedCalls: missedToday.length,
      avgDurationSeconds: avgDurationToday,
      conversionRate: conversionRateToday,
    },
    trend: dayBuckets,
    peakHours: hourCounts,
    apartmentSizeDemand: sizeCounts,
    budgetDistribution: budgetBuckets,
    leadStatusBreakdown: statusCounts,
    totals: {
      allTimeCalls: callRows.length,
      allTimeLeads: leadRows.length,
    },
  });
}

// ----------------------------------------------------------------------------
// Helpers for normalizing free-text fields the AI extracted from speech.
// Callers say "two bedroom", "2BR", "2 bed", etc — none of this is
// structured at capture time (see leadExtraction.ts), so we do light
// normalization here for grouping purposes only. This is intentionally
// simple pattern matching, not a full NLP normalizer.
// ----------------------------------------------------------------------------
function normalizeApartmentSize(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("studio")) return "Studio";
  if (lower.match(/\b1\b/) || lower.includes("one")) return "1BR";
  if (lower.match(/\b2\b/) || lower.includes("two")) return "2BR";
  if (lower.match(/\b3\b/) || lower.includes("three")) return "3BR";
  if (lower.match(/\b4\b/) || lower.includes("four")) return "4BR+";
  return "Other";
}

function parseBudget(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.replace(/,/g, "").match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1]);
}
