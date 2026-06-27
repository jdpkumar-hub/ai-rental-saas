import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/companies
//
// Lists every company on the platform — the platform-admin equivalent of
// company-level dashboards, but seeing across every tenant at once
// instead of being scoped to one.
// ----------------------------------------------------------------------------
export async function GET() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select(
      "id, company_name, company_code, email, phone, twilio_number, subscription_plan, status, logo_url, brand_color, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ companies: companies ?? [] });
}

// ----------------------------------------------------------------------------
// POST /api/platform-admin/companies
//
// This is the actual onboarding action: creates a brand-new company AND
// its first admin user in one step, so after this call the customer can
// log in immediately with the credentials you set here. This is the
// platform-level equivalent of what the original Phase 1 seed.sql did
// manually via raw SQL — now a real, reusable, validated API path.
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: {
    company_name?: string;
    company_code?: string;
    company_email?: string;
    phone?: string;
    twilio_number?: string;
    admin_name?: string;
    admin_email?: string;
    admin_password?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    company_name,
    company_code,
    company_email,
    phone,
    twilio_number,
    admin_name,
    admin_email,
    admin_password,
  } = body;

  if (
    !company_name ||
    !company_code ||
    !company_email ||
    !admin_name ||
    !admin_email ||
    !admin_password
  ) {
    return NextResponse.json(
      {
        error:
          "Company name, company code, company email, admin name, admin email, and admin password are all required.",
      },
      { status: 400 }
    );
  }

  if (admin_password.length < 8) {
    return NextResponse.json(
      { error: "Admin password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const normalizedCode = company_code.trim().toLowerCase();

  const { data: existingCompany } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("company_code", normalizedCode)
    .maybeSingle();

  if (existingCompany) {
    return NextResponse.json(
      { error: `Company code "${normalizedCode}" is already in use.` },
      { status: 409 }
    );
  }

  const { data: newCompany, error: companyError } = await supabaseAdmin
    .from("companies")
    .insert({
      company_name: company_name.trim(),
      company_code: normalizedCode,
      email: company_email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      twilio_number: twilio_number?.trim() || null,
      subscription_plan: "trial",
      status: "active",
    })
    .select("id, company_name, company_code")
    .single();

  if (companyError || !newCompany) {
    return NextResponse.json(
      { error: companyError?.message || "Failed to create company." },
      { status: 500 }
    );
  }

  const passwordHash = await bcrypt.hash(admin_password, 10);

  const { error: userError } = await supabaseAdmin.from("users").insert({
    company_id: newCompany.id,
    name: admin_name.trim(),
    email: admin_email.trim().toLowerCase(),
    password_hash: passwordHash,
    role: "admin",
    active: true,
  });

  if (userError) {
    // The company row was already created — rather than leave an
    // orphaned company with no admin user able to log in, clean it up
    // so a retry doesn't collide with the now-taken company_code.
    await supabaseAdmin.from("companies").delete().eq("id", newCompany.id);
    return NextResponse.json(
      { error: `Failed to create admin user: ${userError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ company: newCompany });
}
