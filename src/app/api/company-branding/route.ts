import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/company-branding
// PATCH /api/company-branding
//
// Separate from /api/company-settings on purpose: that route manages
// `company_settings` (voice, greeting, business hours — operational
// config for the AI assistant). This route manages `companies` itself
// (logo_url, brand_color — tenant identity/branding). Different table,
// different concern, kept as a different route rather than overloading
// one endpoint with two tables' worth of fields.
//
// IMPORTANT: this route uses supabaseAdmin directly with an explicit
// .eq("id", session.companyId) filter, NOT getTenantClient. The
// getTenantClient wrapper (see supabaseAdmin.ts) assumes every table has
// a `company_id` foreign key column and filters on that — true for
// `leads`, `calls`, `users`, `company_settings`, but NOT true for
// `companies` itself, whose own primary key IS the tenant identifier
// (there's no separate company_id column on companies — that would be
// circular). Using getTenantClient here caused a real bug: "column
// companies.company_id does not exist". Filtering directly by `id` is
// the correct approach for this one table, and still fully tenant-safe
// since session.companyId was already cryptographically verified from
// the signed session JWT before this code runs — never from raw,
// unvalidated input.
// ----------------------------------------------------------------------------

const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("company_name, logo_url, brand_color")
    .eq("id", session.companyId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ branding: data });
}

// ----------------------------------------------------------------------------
// PATCH /api/company-branding
//
// Admin/manager only, same permission level as company-settings, since
// branding is the kind of company-wide decision an individual agent
// shouldn't be changing on a whim.
// ----------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json(
      { error: "You don't have permission to update branding." },
      { status: 403 }
    );
  }

  let body: { logo_url?: string | null; brand_color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("logo_url" in body) {
    const url = body.logo_url?.trim() || null;
    if (url && !url.startsWith("http")) {
      return NextResponse.json(
        { error: "Logo URL must start with http:// or https://" },
        { status: 400 }
      );
    }
    updates.logo_url = url;
  }

  if ("brand_color" in body && body.brand_color) {
    if (!HEX_COLOR_PATTERN.test(body.brand_color)) {
      return NextResponse.json(
        { error: "Brand color must be a valid hex color, e.g. #B5562F" },
        { status: 400 }
      );
    }
    updates.brand_color = body.brand_color;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("companies")
    .update(updates)
    .eq("id", session.companyId)
    .select("company_name, logo_url, brand_color")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ branding: data });
}
