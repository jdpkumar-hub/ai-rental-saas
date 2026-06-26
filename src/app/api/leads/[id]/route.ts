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
// ALLOWED_FIELDS now includes the 5 fields the AI captures during the call
// (name, phone, budget, move_in_date, apartment_size) — these need to stay
// editable so an agent can fix a misheard name (Whisper transcription
// errors do happen) or correct a phone number, without that being treated
// as a separate "admin" capability. They're still never auto-included
// unless explicitly sent in the request body, same as every other field.
//
// company_id, call_id, and the lease_probability columns are never
// user-editable — those are either tenancy-critical or computed, not
// something a person should be able to directly overwrite.
// ----------------------------------------------------------------------------
const ALLOWED_FIELDS = [
  "name",
  "phone",
  "budget",
  "move_in_date",
  "apartment_size",
  "status",
  "notes",
  "assigned_agent_id",
  "tour_scheduled_at",
  "follow_up_date",
];

// Fields that, if changed, should trigger a lease-probability recompute —
// i.e. anything that actually feeds the scoring formula in leaseScore.ts.
// Notes, assigned_agent_id, and the scheduling dates don't affect score.
const SCORE_AFFECTING_FIELDS = [
  "name",
  "phone",
  "budget",
  "move_in_date",
  "apartment_size",
  "status",
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

  const scoreNeedsRecompute = Object.keys(updates).some((field) =>
    SCORE_AFFECTING_FIELDS.includes(field)
  );
  if (scoreNeedsRecompute) {
    const scoreResult = await recomputeAndSaveLeaseProbability(tenantDb, params.id);
    if (scoreResult) {
      updated.lease_probability = scoreResult.probability;
      updated.lease_probability_score = scoreResult.score;
      updated.lease_probability_reasons = scoreResult.reasons;
    }
  }

  return NextResponse.json({ lead: updated });
}

// ----------------------------------------------------------------------------
// DELETE /api/leads/[id]
//
// Permanently removes a lead record, per your explicit choice of hard
// delete over archiving. This does NOT delete the underlying call: the
// `calls.lead_id` foreign key is declared `on delete set null` (see
// migration 0003), so the call's transcript and recording remain intact
// in Call History — only the lead-specific CRM data (status, notes,
// assignment, scores) is actually removed.
// ----------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { error } = await tenantDb.from("leads").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
