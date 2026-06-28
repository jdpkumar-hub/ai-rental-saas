import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_FIELDS = ["name", "html_content", "accent_color"];

// ----------------------------------------------------------------------------
// PATCH /api/platform-admin/landing-page-variants/[id]
// DELETE /api/platform-admin/landing-page-variants/[id]
//
// PATCH never touches is_live — switching which variant is live is a
// distinct, deliberate action (see the /activate sub-route), kept
// separate from ordinary content edits so editing a variant's HTML
// never accidentally also makes it live.
//
// DELETE refuses to remove the currently-live variant — deleting it
// would leave the public site with no live row at all (the
// /api/landing-page route falls back to a placeholder in that case,
// but that's a degraded state nobody should hit by accident). Activate
// a different variant first if you want to delete this one.
// ----------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("landing_page_variants")
    .update(updates)
    .eq("id", params.id)
    .select("id, name, html_content, accent_color, is_live, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ variant: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data: variant } = await supabaseAdmin
    .from("landing_page_variants")
    .select("id, is_live")
    .eq("id", params.id)
    .maybeSingle();

  if (!variant) {
    return NextResponse.json({ error: "Variant not found." }, { status: 404 });
  }

  if (variant.is_live) {
    return NextResponse.json(
      {
        error:
          "Can't delete the currently live variant. Activate a different one first.",
      },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("landing_page_variants")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
