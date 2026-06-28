import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Forces this route to always run dynamically on every request, never
// statically cached at build time. Without this, Next.js's default
// behavior for a route handler with no request-dependent input (this
// one takes no params, reads no cookies/headers) is to treat it as
// STATIC — meaning it would bake in whichever variant was live at BUILD
// time and serve that same response forever, completely ignoring any
// later changes made in platform-admin. This was the root cause of
// "I switch the live variant but the real page doesn't change."
export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------------
// GET /api/landing-page
//
// Public, unauthenticated — returns whichever landing_page_variants row
// currently has is_live = true. This is what the root page (via
// middleware.ts) serves for any logged-out visitor. If somehow no
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
    return NextResponse.json(
      {
        html_content:
          "<html><body style='font-family:sans-serif;padding:60px;text-align:center;'><h1>AI Rental Office Assistant</h1><p>Please check back shortly.</p></body></html>",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Cache-Control: no-store on the response itself, as a second layer of
  // defense alongside `dynamic = "force-dynamic"` above and the
  // `cache: "no-store"` on the middleware's fetch call — three
  // independent places that could each cause stale caching if only one
  // were fixed, so all three are addressed together.
  return NextResponse.json(
    { html_content: data.html_content },
    { headers: { "Cache-Control": "no-store" } }
  );
}
