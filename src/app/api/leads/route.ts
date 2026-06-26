import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/leads
//
// Lists every lead for the logged-in user's company, most recent first,
// with the assigned agent's name joined in (rather than just their UUID)
// so the CRM table can display something meaningful.
// ----------------------------------------------------------------------------

type LeadRow = {
  id: string;
  call_id: string | null;
  name: string | null;
  phone: string | null;
  budget: string | null;
  move_in_date: string | null;
  apartment_size: string | null;
  status: string;
  notes: string | null;
  assigned_agent_id: string | null;
  tour_scheduled_at: string | null;
  follow_up_date: string | null;
  lease_probability: string | null;
  lease_probability_score: number | null;
  lease_probability_reasons: string[] | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  name: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data: leads, error } = await tenantDb
    .from("leads")
    .select(
      "id, call_id, name, phone, budget, move_in_date, apartment_size, status, notes, assigned_agent_id, tour_scheduled_at, follow_up_date, lease_probability, lease_probability_score, lease_probability_reasons, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leadRows = (leads ?? []) as LeadRow[];

  const agentIds = leadRows
    .map((l) => l.assigned_agent_id)
    .filter(Boolean) as string[];

  let agentsById: Record<string, string> = {};
  if (agentIds.length > 0) {
    const { data: agents } = await tenantDb
      .from("users")
      .select("id, name")
      .in("id", agentIds);
    const agentRows = (agents ?? []) as UserRow[];
    agentsById = Object.fromEntries(agentRows.map((a) => [a.id, a.name]));
  }

  const enriched = leadRows.map((lead) => ({
    ...lead,
    assigned_agent_name: lead.assigned_agent_id
      ? agentsById[lead.assigned_agent_id] ?? null
      : null,
  }));

  return NextResponse.json({ leads: enriched });
}
