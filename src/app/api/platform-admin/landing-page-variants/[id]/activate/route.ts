import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// POST /api/platform-admin/landing-page-variants/[id]/activate
//
// Makes this variant the live one, shown to every public visitor. Since
// migration 0012's partial unique index only allows ONE row with
// is_live = true at a time, this must explicitly turn off whichever
// variant was previously live before turning on the new one.
// ----------------------------------------------------------------------------
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data: target } = await supabaseAdmin
    .from("landing_page_variants")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Variant not found." }, { status: 404 });
  }

  const { error: turnOffError } = await supabaseAdmin
    .from("landing_page_variants")
    .update({ is_live: false })
    .eq("is_live", true);

  if (turnOffError) {
    return NextResponse.json({ error: turnOffError.message }, { status: 500 });
  }

  const { data: updated, error: turnOnError } = await supabaseAdmin
    .from("landing_page_variants")
    .update({ is_live: true })
    .eq("id", params.id)
    .select("id, name, is_live")
    .single();

  if (turnOnError) {
    return NextResponse.json({ error: turnOnError.message }, { status: 500 });
  }

  return NextResponse.json({ variant: updated });
}
