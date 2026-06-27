import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// POST /api/inquiries
//
// Public, unauthenticated — this is the landing page's "request access"
// form. Per your Path B choice, this does NOT create a company or login
// automatically. It just records the inquiry so you (the platform admin)
// can review it and manually onboard the company through the
// platform-admin dashboard.
//
// No session check here on purpose: anyone visiting the public landing
// page needs to be able to submit this without already having an
// account — that's the entire point of an inquiry form.
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  let body: {
    contact_name?: string;
    company_name?: string;
    email?: string;
    phone?: string;
    message?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { contact_name, company_name, email, phone, message } = body;

  if (!contact_name || !company_name || !email) {
    return NextResponse.json(
      { error: "Name, company name, and email are required." },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("inquiries").insert({
    contact_name: contact_name.trim(),
    company_name: company_name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || null,
    message: message?.trim() || null,
  });

  if (error) {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
