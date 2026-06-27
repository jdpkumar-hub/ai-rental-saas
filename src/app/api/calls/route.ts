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
  caller_name: string | null;
  caller_phone: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

// ----------------------------------------------------------------------------
// GET /api/calls
//
// Lists all calls for the logged-in user's company, most recent first.
//
// caller_name / caller_phone are read directly from `calls` (see
// migration 0006) rather than joined through `leads`. They're written as
// a snapshot the moment a lead first captures them (see voice/turn) and
// kept in sync if an agent later corrects them in the CRM (see
// leads/[id]/route.ts) — but they're NOT cleared if the lead itself is
// deleted. A call is a historical fact; deleting a CRM record shouldn't
// erase what the caller actually said during a real phone call.
//
// Per the Phase 3 spec, each row needs: Customer, Phone, Recording,
// Transcript, Summary, Sentiment, Lead Score, Duration. Summary/Sentiment
// /Lead Score are deferred to Phase 6 per your call — the columns are
// queried as null placeholders here so the dashboard UI can already
// render the right table shape without needing a schema change later.
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
      "id, call_sid, from_number, to_number, status, conversation, recording_url, full_call_recording_url, duration_seconds, summary, sentiment, lead_id, caller_name, caller_phone, started_at, ended_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const callRows = (calls ?? []) as CallRow[];

  // Field names kept as lead_name/lead_phone in the API response for
  // backward compatibility with the existing Call History UI, even
  // though they now come from the call's own snapshot columns rather
  // than an actual join to `leads`.
  const enriched = callRows.map((call) => ({
    ...call,
    lead_name: call.caller_name,
    lead_phone: call.caller_phone,
  }));

  return NextResponse.json({ calls: enriched });
}
