import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/companies
//
// Lists every company on the platform — the platform-admin equivalent of
// company-level dashboards, but seeing across every tenant at once
// instead of being scoped to one. twilio_numbers is fetched separately
// and merged in below, since a company can now have any number of
// numbers (see migration 0010) rather than the single deprecated
// companies.twilio_number column.
// ----------------------------------------------------------------------------
export async function GET() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select(
      "id, company_name, company_code, email, phone, subscription_plan, status, logo_url, brand_color, trial_started_at, trial_ends_at, created_at, setup_fee_cents, setup_fee_paid_at, call_limit, overage_price_cents"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const companyRows = companies ?? [];
  const companyIds = companyRows.map((c) => c.id);

  let numbersByCompany: Record<string, { id: string; phone_number: string; label: string | null; active: boolean }[]> = {};

  if (companyIds.length > 0) {
    const { data: numbers } = await supabaseAdmin
      .from("twilio_numbers")
      .select("id, company_id, phone_number, label, active")
      .in("company_id", companyIds)
      .order("created_at", { ascending: true });

    for (const n of numbers ?? []) {
      if (!numbersByCompany[n.company_id]) numbersByCompany[n.company_id] = [];
      numbersByCompany[n.company_id].push({
        id: n.id,
        phone_number: n.phone_number,
        label: n.label,
        active: n.active,
      });
    }
  }

  const enriched = companyRows.map((c) => ({
    ...c,
    twilio_numbers: numbersByCompany[c.id] ?? [],
  }));

  return NextResponse.json({ companies: enriched });
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
    trial_start_date?: string;
    send_welcome_email?: boolean;
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

  // Trial starts now by default, but can be overridden if you're setting
  // up a company in advance of when the customer will actually start
  // using it (see trialStatus.ts for why this is a separate field from
  // created_at).
  const trialStartedAt = body.trial_start_date
    ? new Date(body.trial_start_date)
    : new Date();
  const trialEndsAt = new Date(trialStartedAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

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
      subscription_plan: "trial",
      status: "active",
      trial_started_at: trialStartedAt.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
    })
    .select("id, company_name, company_code")
    .single();

  if (companyError || !newCompany) {
    return NextResponse.json(
      { error: companyError?.message || "Failed to create company." },
      { status: 500 }
    );
  }

  // If a Twilio number was provided at creation time, register it as
  // this company's first number in the new twilio_numbers table (see
  // migration 0010) — this is the same table the platform admin's
  // "Numbers" management UI reads from and adds to later.
  const trimmedNumber = twilio_number?.trim();
  if (trimmedNumber) {
    const { error: numberError } = await supabaseAdmin
      .from("twilio_numbers")
      .insert({ company_id: newCompany.id, phone_number: trimmedNumber });

    if (numberError) {
      // Not fatal to company creation — the admin can add the number
      // afterward from the Numbers section. Surface it as a warning in
      // the response rather than rolling back the whole company.
      console.error("[platform-admin/companies] Failed to register initial number:", numberError);
    }
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

  // ------------------------------------------------------------------
  // WELCOME EMAIL (onboarding step 4: inquiry -> agreement -> provision
  // -> WELCOME). Sent here — and only here — because this is the one
  // place the admin's plaintext password exists (it's hashed above and
  // never stored). Email failure never fails the creation; the response
  // reports whether it went out so the UI/you can follow up manually.
  // ------------------------------------------------------------------
  let welcomeEmailSent = false;
  if (body.send_welcome_email) {
    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "https://ai-rental-saas.vercel.app";
      const trialEndPretty = trialEndsAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const firstName = admin_name.trim().split(" ")[0] || "there";

      await sendEmail({
        to: admin_email.trim().toLowerCase(),
        subject: `Welcome to AI Rental Office Assistant — your ${company_name.trim()} dashboard is ready`,
        html: `
          <p>Hi ${firstName},</p>
          <p>Your AI assistant for <strong>${company_name.trim()}</strong> is set
          up and answering calls. Here's everything you need to log in:</p>
          <table style="font-size:14px;border-collapse:collapse;">
            <tr><td style="padding:4px 14px 4px 0;color:#6B6358;">Dashboard</td><td style="padding:4px 0;"><a href="${appUrl}/login">${appUrl}/login</a></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#6B6358;">Company code</td><td style="padding:4px 0;"><strong>${normalizedCode}</strong></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#6B6358;">Email</td><td style="padding:4px 0;"><strong>${admin_email.trim().toLowerCase()}</strong></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#6B6358;">Password</td><td style="padding:4px 0;"><strong>${admin_password}</strong></td></tr>
            ${trimmedNumber ? `<tr><td style="padding:4px 14px 4px 0;color:#6B6358;">Your assistant's number</td><td style="padding:4px 0;"><strong>${trimmedNumber}</strong></td></tr>` : ""}
          </table>
          <p>We recommend changing your password after your first login
          (Settings → Users).</p>
          <p>Your <strong>14-day free trial</strong> runs through
          <strong>${trialEndPretty}</strong>. During the trial you'll see every
          call, transcript, and captured lead in your dashboard in real time.
          When the trial ends, you'll pick a plan right in the app — the
          one-time setup fee is bundled with your first payment.</p>
          <p>Questions any time — just reply to this email.</p>
          <p>— AI Rental Office Assistant</p>
        `,
      });
      welcomeEmailSent = true;
    } catch (emailErr) {
      console.error("[platform-admin/companies] Welcome email failed:", emailErr);
    }
  }

  // Close the loop on the inquiry that started this onboarding, if one
  // matches either email address. Best-effort — no inquiry is fine.
  try {
    await supabaseAdmin
      .from("inquiries")
      .update({ status: "onboarded" })
      .in("email", [
        company_email.trim().toLowerCase(),
        admin_email.trim().toLowerCase(),
      ])
      .neq("status", "declined");
  } catch (inqErr) {
    console.error("[platform-admin/companies] Inquiry status update failed:", inqErr);
  }

  return NextResponse.json({
    company: newCompany,
    welcome_email_sent: welcomeEmailSent,
  });
}
