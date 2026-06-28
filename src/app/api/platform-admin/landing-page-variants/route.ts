import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/landing-page-variants
// POST /api/platform-admin/landing-page-variants
//
// Management endpoints for the swappable landing page system. GET
// returns html_content too (unlike the public /api/landing-page route,
// which only ever exposes the live one) since platform-admin needs the
// full content to preview/edit each variant.
// ----------------------------------------------------------------------------
export async function GET() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data, error } = await supabaseAdmin
    .from("landing_page_variants")
    .select("id, name, html_content, accent_color, is_live, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ variants: data ?? [] });
}

export async function POST(request: NextRequest) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: { name?: string; html_content?: string; accent_color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.name || !body.html_content) {
    return NextResponse.json(
      { error: "Name and HTML content are both required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("landing_page_variants")
    .insert({
      name: body.name.trim(),
      html_content: body.html_content,
      accent_color: body.accent_color || "#B5562F",
      is_live: false,
    })
    .select("id, name, html_content, accent_color, is_live, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ variant: data });
}
