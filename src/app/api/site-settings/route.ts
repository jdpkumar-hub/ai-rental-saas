import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/site-settings
//
// Public, unauthenticated -- both login pages (company + platform-admin)
// read this server-side to apply the configured background.
// ----------------------------------------------------------------------------
export async function GET() {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select(
      "login_background_color, login_background_image, platform_login_background_color, platform_login_background_image, contact_email"
    )
    .eq("id", 1)
    .maybeSingle();

  return NextResponse.json(
    {
      login_background_color: data?.login_background_color ?? "#F4EEE3",
      login_background_image: data?.login_background_image ?? null,
      platform_login_background_color:
        data?.platform_login_background_color ?? "#1C1815",
      platform_login_background_image: data?.platform_login_background_image ?? null,
      contact_email: data?.contact_email ?? "hello@yourdomain.com",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
