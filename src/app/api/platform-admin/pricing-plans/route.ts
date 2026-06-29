import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/pricing-plans
//
// Lists every pricing plan (including inactive ones, unlike the public
// /api/pricing route) so you can see and manage the full set, not just
// what's currently live on the landing page.
// ----------------------------------------------------------------------------
export async function GET() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data, error } = await supabaseAdmin
    .from("pricing_plans")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ plans: data ?? [] });
}
