import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_FIELDS = [
  "company_name",
  "phone",
  "twilio_number",
  "subscription_plan",
  "status",
  "logo_url",
  "brand_color",
];

const VALID_STATUSES = ["active", "suspended", "cancelled"];

// ----------------------------------------------------------------------------
// PATCH /api/platform-admin/companies/[id]
//
// Lets you, the platform admin, update any company's Twilio number,
// status, subscription plan, or branding — this is the "upload a logo
// for a customer who doesn't have a website" path you asked for. The
// SAME logo_url/brand_color fields the company's own Settings page
// writes to are writable here too; nothing different about the columns,
// just a different (platform-level) door into the same data.
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

  if ("status" in updates && !VALID_STATUSES.includes(updates.status as string)) {
    return NextResponse.json(
      { error: `Status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("companies")
    .update(updates)
    .eq("id", params.id)
    .select(
      "id, company_name, company_code, email, phone, twilio_number, subscription_plan, status, logo_url, brand_color"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ company: data });
}
