import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const HEX_COLOR_PATTERN = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

export async function GET() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return NextResponse.json({ settings: data });
}

// ----------------------------------------------------------------------------
// PATCH /api/platform-admin/site-settings
//
// Updates the single site_settings row. Supports both the company
// login's background pair AND the platform-admin login's background
// pair independently -- see migration 0014 for why these are kept
// separate rather than shared.
// ----------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: {
    login_background_color?: string;
    login_background_image?: string | null;
    platform_login_background_color?: string;
    platform_login_background_image?: string | null;
    contact_email?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.contact_email !== undefined) {
    const email = body.contact_email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    }
    updates.contact_email = email;
  }

  if (body.login_background_color !== undefined) {
    if (!HEX_COLOR_PATTERN.test(body.login_background_color)) {
      return NextResponse.json(
        { error: "Background color must be a valid hex color, e.g. #F4EEE3" },
        { status: 400 }
      );
    }
    updates.login_background_color = body.login_background_color;
  }

  if (body.login_background_image !== undefined) {
    const url = body.login_background_image?.trim() || null;
    if (url && !url.startsWith("http")) {
      return NextResponse.json(
        { error: "Background image must be a URL starting with http:// or https://" },
        { status: 400 }
      );
    }
    updates.login_background_image = url;
  }

  if (body.platform_login_background_color !== undefined) {
    if (!HEX_COLOR_PATTERN.test(body.platform_login_background_color)) {
      return NextResponse.json(
        { error: "Background color must be a valid hex color, e.g. #1C1815" },
        { status: 400 }
      );
    }
    updates.platform_login_background_color = body.platform_login_background_color;
  }

  if (body.platform_login_background_image !== undefined) {
    const url = body.platform_login_background_image?.trim() || null;
    if (url && !url.startsWith("http")) {
      return NextResponse.json(
        { error: "Background image must be a URL starting with http:// or https://" },
        { status: 400 }
      );
    }
    updates.platform_login_background_image = url;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("site_settings")
    .update(updates)
    .eq("id", 1)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
