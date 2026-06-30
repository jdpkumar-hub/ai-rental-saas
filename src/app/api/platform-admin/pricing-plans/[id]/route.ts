import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_FIELDS = [
  "name",
  "tagline",
  "description",
  "setup_fee",
  "monthly_fee",
  "quarterly_fee",
  "yearly_fee",
  "features",
  "is_featured",
  "display_order",
  "active",
];

// ----------------------------------------------------------------------------
// PATCH /api/platform-admin/pricing-plans/[id]
//
// Updates a pricing plan's editable fields. plan_key is deliberately NOT
// in ALLOWED_FIELDS -- it's the stable identifier the landing page JS
// uses to find which DOM slot a plan belongs to (see each variant's
// pricing-render script), so changing it after creation could silently
// break which card a plan's numbers render into. Renaming the
// human-visible `name` is fine and expected; changing `plan_key` is not.
// ----------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

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

  if (
    "setup_fee" in updates &&
    (typeof updates.setup_fee !== "number" || updates.setup_fee < 0)
  ) {
    return NextResponse.json(
      { error: "Setup fee must be a non-negative number." },
      { status: 400 }
    );
  }
  if (
    "monthly_fee" in updates &&
    (typeof updates.monthly_fee !== "number" || updates.monthly_fee < 0)
  ) {
    return NextResponse.json(
      { error: "Monthly fee must be a non-negative number." },
      { status: 400 }
    );
  }
  if (
    "quarterly_fee" in updates &&
    (typeof updates.quarterly_fee !== "number" || updates.quarterly_fee < 0)
  ) {
    return NextResponse.json(
      { error: "Quarterly fee must be a non-negative number." },
      { status: 400 }
    );
  }
  if (
    "yearly_fee" in updates &&
    (typeof updates.yearly_fee !== "number" || updates.yearly_fee < 0)
  ) {
    return NextResponse.json(
      { error: "Yearly fee must be a non-negative number." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("pricing_plans")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ plan: data });
}
