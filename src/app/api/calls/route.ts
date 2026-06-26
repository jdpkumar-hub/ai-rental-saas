import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

// Minimal shape of what we select below — declared explicitly because the
// tenant client's query builder methods return `any` (see the comment in
// supabaseAdmin.ts on why), which otherwise leaves array callbacks like
// .map() with implicitly-`any` parameters.
type CallRow = {
  id: string;
  call_sid: string;
  from_number: string | null;
  to_number: string | null;
  status: string;
  conversation: unknown;
  recording_url: string | null;
  full_call_recording_url: string | null;
  duration_seconds: number | null;
  summary: string | null;
  sentiment: string | null;
  lead_id: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
};

// ----------------------------------------------------------------------------
// GET /api/calls
//
// Lists all calls for the logged-in user's company, most recent first,
// joined with whatever lead data was extracted from each call. This is the
// data source for the Phase 3 Call History table.
//
// Per the Phase 3 spec, each row needs: Customer (from lead.name),
// Phone, Recording, Transcript, Summary, Sentiment, Lead Score, Duration.
// Summary/Sentiment/Lead Score are deferred to Phase 6 per your call —
// the columns are queried as null placeholders here so the dashboard UI
// can already render the right table shape and "—" for not-yet-available
// fields, without needing a schema change later.
// ----------------------------------------------------------------------------
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data: calls, error } = await tenantDb
    .from("calls")
    .select(
      "id, call_sid, from_number, to_number, status, conversation, recording_url, full_call_recording_url, duration_seconds, summary, sentiment, lead_id, started_at, ended_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const callRows = (calls ?? []) as CallRow[];

  // Fetch lead names/phones for every call that has one, in a single query
  // rather than one query per call (N+1), then stitch them together below.
  const leadIds = callRows.map((c) => c.lead_id).filter(Boolean) as string[];

  let leadsById: Record<string, { name: string | null; phone: string | null }> = {};

  if (leadIds.length > 0) {
    const { data: leads } = await tenantDb
      .from("leads")
      .select("id, name, phone")
      .in("id", leadIds);

    const leadRows = (leads ?? []) as LeadRow[];
    leadsById = Object.fromEntries(leadRows.map((l) => [l.id, l]));
  }

  const enriched = callRows.map((call) => ({
    ...call,
    lead_name: call.lead_id ? leadsById[call.lead_id]?.name ?? null : null,
    lead_phone: call.lead_id ? leadsById[call.lead_id]?.phone ?? null : null,
  }));

  return NextResponse.json({ calls: enriched });
}
