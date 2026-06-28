import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/landing-page
//
// Public, unauthenticated — returns whichever landing_page_variants row
// currently has is_live = true. This is what the root page (see
// src/app/page.tsx) renders for any logged-out visitor. If somehow no
// variant is marked live (shouldn't happen given the seed, but
// defensively), falls back to a minimal placeholder rather than a
// broken/blank page.
// ----------------------------------------------------------------------------
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("landing_page_variants")
    .select("html_content")
    .eq("is_live", true)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({
      html_content:
        "<html><body style='font-family:sans-serif;padding:60px;text-align:center;'><h1>AI Rental Office Assistant</h1><p>Please check back shortly.</p></body></html>",
    });
  }

  return NextResponse.json({ html_content: data.html_content });
}
