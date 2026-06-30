import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------------
// GET /api/pricing
//
// Public, unauthenticated -- every landing page variant fetches this via
// a small client-side script and injects the numbers into its own DOM
// (see each variant's <script> block). This is what makes pricing
// editable from platform-admin without touching any variant's HTML: the
// HTML just has placeholder elements with data-pricing-* attributes,
// and this route supplies the actual numbers at request time.
// ----------------------------------------------------------------------------
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("pricing_plans")
    .select(
      "plan_key, name, tagline, description, setup_fee, monthly_fee, quarterly_fee, yearly_fee, features, is_featured, display_order"
    )
    .eq("active", true)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ plans: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { plans: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
