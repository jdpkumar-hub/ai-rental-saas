import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";
import { recomputeAndSaveLeaseProbability } from "@/lib/leaseScore";

// ----------------------------------------------------------------------------
// PATCH /api/leads/[id]
//
// Per your Phase 5 spec: "Managers can update everything" — so unlike the
// company-settings route (admin/manager only), any logged-in user
// (admin, manager, or agent) can update a lead's CRM fields. This matches
// how a real leasing office works: any agent can add notes or update a
// status on a lead they're working, not just managers.
//
// Only a known set of fields can be updated (never company_id, call_id,
// or the lease_probability columns directly — those are computed, not
// user-editable, see leaseScore.ts).
// ----------------------------------------------------------------------------
const ALLOWED_FIELDS = [
  "status",
  "notes",
  "assigned_agent_id",
  "tour_scheduled_at",
  "follow_up_date",
];

const VALID_STATUSES = ["new", "contacted", "toured", "applied", "leased", "lost"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  if ("status" in updates && !VALID_STATUSES.includes(updates.status as string)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data: updated, error } = await tenantDb
    .from("leads")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if ("status" in updates) {
    await recomputeAndSaveLeaseProbability(tenantDb, params.id);
  }

  return NextResponse.json({ lead: updated });
}
