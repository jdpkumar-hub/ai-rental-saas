import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// PATCH /api/platform-admin/companies/[id]/numbers/[numberId]
// DELETE /api/platform-admin/companies/[id]/numbers/[numberId]
//
// PATCH: toggle active/inactive, or change the label. Deactivating a
// number (rather than deleting it) means calls to it will be rejected by
// /api/voice/incoming (which filters on active=true) without losing the
// record that this number once belonged to this company.
//
// DELETE: permanently removes the number from this company. This does
// NOT affect any past calls already received on that number — those
// calls keep their own snapshot of to_number on the calls table
// regardless of whether the number is still registered anywhere.
//
// Both verify the number actually belongs to the company in the URL,
// not just that numberId exists somewhere — same defensive pattern as
// the user password-reset route, to prevent acting on the wrong
// company's number via a mismatched id pair.
// ----------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; numberId: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: { active?: boolean; label?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if ("active" in body) updates.active = body.active;
  if ("label" in body) updates.label = body.label?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("twilio_numbers")
    .update(updates)
    .eq("id", params.numberId)
    .eq("company_id", params.id)
    .select("id, phone_number, label, active, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Number not found at this company." },
      { status: 404 }
    );
  }

  return NextResponse.json({ number: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; numberId: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { error, count } = await supabaseAdmin
    .from("twilio_numbers")
    .delete({ count: "exact" })
    .eq("id", params.numberId)
    .eq("company_id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json(
      { error: "Number not found at this company." },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
