import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/insights
//
// Phase 6 — "AI Analytics", built deliberately as rule-based, deterministic
// logic rather than an LLM-generated narrative (per your choice). Every
// insight here is computed from a clear, auditable rule against data the
// system already captures — no extra GPT call, no cost, no risk of an LLM
// inventing a plausible-sounding but wrong summary.
//
// STALE_DAYS = 10 (your chosen threshold): a lead in "new" or "contacted"
// status for 10+ days with no follow-up scheduled (or a follow-up date
// that's already passed) is flagged as going cold — exactly the kind of
// thing a busy leasing office would otherwise lose track of.
// ----------------------------------------------------------------------------

const STALE_DAYS = 10;

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  lease_probability: "low" | "medium" | "high" | null;
  follow_up_date: string | null;
  apartment_size: string | null;
  budget: string | null;
  created_at: string;
  updated_at: string;
};

type CallRow = {
  id: string;
  status: string;
  lead_id: string | null;
  created_at: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data: leads, error: leadsError } = await tenantDb
    .from("leads")
    .select(
      "id, name, phone, status, lease_probability, follow_up_date, apartment_size, budget, created_at, updated_at"
    );
  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const { data: calls, error: callsError } = await tenantDb
    .from("calls")
    .select("id, status, lead_id, created_at");
  if (callsError) {
    return NextResponse.json({ error: callsError.message }, { status: 500 });
  }

  const leadRows = (leads ?? []) as LeadRow[];
  const callRows = (calls ?? []) as CallRow[];

  const now = new Date();
  const staleThreshold = new Date(now);
  staleThreshold.setDate(staleThreshold.getDate() - STALE_DAYS);

  const hotLeadsNeedingContact = leadRows
    .filter((l) => l.lease_probability === "high" && l.status === "new")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const staleLeads = leadRows.filter((l) => {
    if (!["new", "contacted"].includes(l.status)) return false;
    const isOld = new Date(l.updated_at) < staleThreshold;
    const followUpPassed = l.follow_up_date && new Date(l.follow_up_date) < now;
    const noFollowUp = !l.follow_up_date;
    return isOld && (noFollowUp || followUpPassed);
  });

  const missedCalls = callRows.filter(
    (c) => c.status === "failed" || c.status === "abandoned"
  );
  const completedWithoutLead = callRows.filter(
    (c) => c.status === "completed" && !c.lead_id
  );

  const sizeCounts: Record<string, number> = {};
  for (const l of leadRows) {
    if (!l.apartment_size) continue;
    const key = normalizeApartmentSize(l.apartment_size);
    sizeCounts[key] = (sizeCounts[key] ?? 0) + 1;
  }
  const topSize = Object.entries(sizeCounts).sort((a, b) => b[1] - a[1])[0];

  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const thisWeekCalls = callRows.filter((c) => new Date(c.created_at) >= oneWeekAgo);
  const lastWeekCalls = callRows.filter(
    (c) => new Date(c.created_at) >= twoWeeksAgo && new Date(c.created_at) < oneWeekAgo
  );

  const thisWeekConversion =
    thisWeekCalls.length > 0
      ? Math.round(
          (thisWeekCalls.filter((c) => c.lead_id).length / thisWeekCalls.length) * 100
        )
      : null;
  const lastWeekConversion =
    lastWeekCalls.length > 0
      ? Math.round(
          (lastWeekCalls.filter((c) => c.lead_id).length / lastWeekCalls.length) * 100
        )
      : null;

  return NextResponse.json({
    hotLeadsNeedingContact: hotLeadsNeedingContact.map(toLeadSummary),
    staleLeads: staleLeads.map(toLeadSummary),
    missedCallsCount: missedCalls.length,
    completedWithoutLeadCount: completedWithoutLead.length,
    topApartmentSize: topSize ? { size: topSize[0], count: topSize[1] } : null,
    conversionTrend: {
      thisWeek: thisWeekConversion,
      lastWeek: lastWeekConversion,
    },
    staleDaysThreshold: STALE_DAYS,
  });
}

function toLeadSummary(lead: LeadRow) {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    status: lead.status,
    lease_probability: lead.lease_probability,
    follow_up_date: lead.follow_up_date,
    updated_at: lead.updated_at,
  };
}

function normalizeApartmentSize(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("studio")) return "Studio";
  if (lower.match(/\b1\b/) || lower.includes("one")) return "1BR";
  if (lower.match(/\b2\b/) || lower.includes("two")) return "2BR";
  if (lower.match(/\b3\b/) || lower.includes("three")) return "3BR";
  if (lower.match(/\b4\b/) || lower.includes("four")) return "4BR+";
  return "Other";
}
