import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_FIELDS = [
  "company_name",
  "phone",
  "subscription_plan",
  "status",
  "logo_url",
  "brand_color",
  "trial_ends_at",
  "setup_fee_cents",
  "call_limit",
  "overage_price_cents",
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

  if ("setup_fee_cents" in updates) {
    const cents = updates.setup_fee_cents;
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0) {
      return NextResponse.json(
        { error: "setup_fee_cents must be a whole number of cents (0 or more)." },
        { status: 400 }
      );
    }
  }

  // call_limit: null means UNLIMITED; otherwise a non-negative integer.
  if ("call_limit" in updates && updates.call_limit !== null) {
    const limit = updates.call_limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0) {
      return NextResponse.json(
        { error: "call_limit must be null (unlimited) or a whole number of calls (0 or more)." },
        { status: 400 }
      );
    }
  }

  if ("overage_price_cents" in updates) {
    const cents = updates.overage_price_cents;
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0) {
      return NextResponse.json(
        { error: "overage_price_cents must be a whole number of cents (0 or more)." },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("companies")
    .update(updates)
    .eq("id", params.id)
    .select(
      "id, company_name, company_code, email, phone, subscription_plan, status, logo_url, brand_color, trial_started_at, trial_ends_at, setup_fee_cents, setup_fee_paid_at, call_limit, overage_price_cents"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ company: data });
}

// ----------------------------------------------------------------------------
// DELETE /api/platform-admin/companies/[id]
//
// PERMANENT removal of a company and everything that cascades from it:
// its users, leads, calls (and their recordings/transcripts), company
// settings — every table that references companies.id with
// `on delete cascade` (see Phase 1-5 migrations) gets wiped along with
// the company row itself. There is no undo.
//
// For the common "I made a mistake" or "this customer cancelled" case,
// use PATCH with { status: "cancelled" } instead — that keeps every
// byte of their data intact and just blocks login, fully reversible by
// setting status back to "active". This DELETE endpoint is reserved for
// genuinely wanting the data gone forever.
//
// Requires the request body to include { confirm: "<company_code>" }
// matching the company's actual code — a lightweight but deliberate
// speed bump against a stray click on the wrong row. The frontend makes
// the person actually type the company's code to confirm, the same
// pattern many real platforms (GitHub repo deletion, etc.) use for
// destructive actions.
// ----------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: { confirm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { data: company, error: lookupError } = await supabaseAdmin
    .from("companies")
    .select("id, company_code")
    .eq("id", params.id)
    .maybeSingle();

  if (lookupError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  if (body.confirm !== company.company_code) {
    return NextResponse.json(
      { error: "Confirmation text did not match the company code." },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("companies")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
