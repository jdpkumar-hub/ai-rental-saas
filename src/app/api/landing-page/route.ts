import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getLandingContent, renderLandingHtml } from "@/lib/landingContent";

// Forces this route to always run dynamically on every request, never
// statically cached at build time. Without this, Next.js would bake in
// whichever variant was live at BUILD time and serve it forever,
// ignoring later platform-admin changes ("I switch the live variant but
// the real page doesn't change").
export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------------
// GET /api/landing-page
//
// Public, unauthenticated — returns the live landing_page_variants row's
// HTML, now rendered through the dynamic-content layer:
//   - tokens {{HEADLINE}} {{SUBHEADLINE}} {{CTA_TEXT}} {{PHONE}} {{EMAIL}}
//     are replaced with the values saved in the admin "Landing content"
//     card (landing_content table)
//   - the variant's accent_color is injected as the CSS variable
//     --accent, overriding any default the variant declares
// Variants without tokens render exactly as before (backward compatible).
// Falls back to a minimal placeholder if no variant is live.
// ----------------------------------------------------------------------------
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("landing_page_variants")
    .select("html_content, accent_color")
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

  const content = await getLandingContent(supabaseAdmin);
  const rendered = renderLandingHtml(
    data.html_content,
    content,
    data.accent_color || "#B5562F"
  );

  // Cache-Control: no-store as a second layer of defense alongside
  // `dynamic = "force-dynamic"` above and the middleware fetch's
  // `cache: "no-store"` — three independent places that could each
  // cause stale caching, all addressed together.
  return NextResponse.json(
    { html_content: rendered },
    { headers: { "Cache-Control": "no-store" } }
  );
}
