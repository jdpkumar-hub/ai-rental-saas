import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/companies/[id]/numbers
// POST /api/platform-admin/companies/[id]/numbers
//
// Manage the list of Twilio numbers routed to a single company. Every
// number for a company shares the same greeting/config (company_settings)
// per your choice — adding a second, third, or sixth number here doesn't
// require any new config, it just means more phone numbers all route to
// the same shared assistant setup. See migration 0010 for the schema
// rationale and src/app/api/voice/incoming/route.ts for how a call is
// actually routed once dialed.
// ----------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data, error } = await supabaseAdmin
    .from("twilio_numbers")
    .select("id, phone_number, label, active, created_at")
    .eq("company_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ numbers: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: { phone_number?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const phoneNumber = body.phone_number?.trim();
  if (!phoneNumber) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data: existing } = await supabaseAdmin
    .from("twilio_numbers")
    .select("id, company_id")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error:
          existing.company_id === params.id
            ? "This number is already registered to this company."
            : "This number is already registered to a different company.",
      },
      { status: 409 }
    );
  }

  const { data: newNumber, error } = await supabaseAdmin
    .from("twilio_numbers")
    .insert({
      company_id: params.id,
      phone_number: phoneNumber,
      label: body.label?.trim() || null,
    })
    .select("id, phone_number, label, active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ number: newNumber });
}
