import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PlatformLoginForm from "./PlatformLoginForm";

// ----------------------------------------------------------------------------
// Server component wrapper — same theme-matching pattern as the company
// login: the LIVE landing variant's accent color drives this page's
// look, so both login doors stay uniform with the public site.
// ----------------------------------------------------------------------------
export default async function PlatformAdminLoginPage() {
  const [{ data: settings }, { data: liveVariant }] = await Promise.all([
    supabaseAdmin
      .from("site_settings")
      .select("platform_login_background_image")
      .eq("id", 1)
      .maybeSingle(),
    supabaseAdmin
      .from("landing_page_variants")
      .select("accent_color")
      .eq("is_live", true)
      .maybeSingle(),
  ]);

  return (
    <PlatformLoginForm
      accentColor={liveVariant?.accent_color ?? "#B5562F"}
      backgroundImage={settings?.platform_login_background_image ?? null}
    />
  );
}
