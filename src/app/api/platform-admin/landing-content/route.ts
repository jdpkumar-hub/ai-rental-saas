import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landingContent";

const FIELDS = ["headline", "subheadline", "cta_text", "phone", "email"] as const;

// ----------------------------------------------------------------------------
// GET  /api/platform-admin/landing-content — current editable content
// PATCH /api/platform-admin/landing-content — save edits
//
// Powers the "Landing Content" card in the admin Landing Pages tab.
// Values are substituted into the live variant's tokens at serve time
// (see src/lib/landingContent.ts), so saving here updates the public
// site immediately — no re-upload, no deploy.
// ----------------------------------------------------------------------------
export async function GET() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data, error } = await supabaseAdmin
    .from("landing_content")
    .select("headline, subheadline, cta_text, phone, email")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ content: { ...DEFAULT_LANDING_CONTENT, ...(data ?? {}) } });
}

export async function PATCH(request: NextRequest) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (f in body) {
      if (typeof body[f] !== "string") {
        return NextResponse.json({ error: `${f} must be a string.` }, { status: 400 });
      }
      updates[f] = (body[f] as string).trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("landing_content")
    .upsert({ id: 1, ...updates })
    .select("headline, subheadline, cta_text, phone, email")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ content: data });
}
