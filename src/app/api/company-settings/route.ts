import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/company-settings
//
// This route is the reference example for every data route you'll add in
// later phases (leads, calls, analytics, etc). The pattern is always:
//
//   1. Read the session -> if missing, reject with 401 immediately.
//   2. Open a tenant-scoped client using session.companyId.
//   3. Query normally — the tenant client (src/lib/supabaseAdmin.ts)
//      automatically applies .eq('company_id', ...) to every query, so
//      you can't accidentally return another company's rows.
//
// Try it: log in as Sterling Heights vs Lakehurst Apartments and hit this
// route — you'll get back each company's own settings, never the other's.
// ----------------------------------------------------------------------------
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data, error } = await tenantDb
    .from("company_settings")
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data, companyCode: session.companyCode });
}

// ----------------------------------------------------------------------------
// PATCH /api/company-settings
// Lets a logged-in user update their OWN company's settings (greeting,
// hours, voice, etc). Only admin/manager roles can do this.
// ----------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json(
      { error: "You don't have permission to update settings." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Only allow a known set of fields to be updated — never trust the
  // client to send company_id, since that's the one field that must
  // never change.
  const allowedFields = [
    "greeting",
    "business_hours",
    "voice",
    "timezone",
    "sms_enabled",
    "email_enabled",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data, error } = await tenantDb
    .from("company_settings")
    .update(updates)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
