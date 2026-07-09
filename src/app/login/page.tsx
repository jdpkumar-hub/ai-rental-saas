import { supabaseAdmin } from "@/lib/supabaseAdmin";
import LoginForm from "./LoginForm";

// ----------------------------------------------------------------------------
// Server component wrapper for the login page — fetches (1) the optional
// background image from site_settings and (2) the LIVE landing variant's
// accent color, so the login screen always matches whatever theme is
// currently live on the public marketing page. Switch the landing
// variant in platform-admin and this page re-skins itself automatically.
// ----------------------------------------------------------------------------
export default async function LoginPage() {
  const [{ data: settings }, { data: liveVariant }] = await Promise.all([
    supabaseAdmin
      .from("site_settings")
      .select("login_background_image")
      .eq("id", 1)
      .maybeSingle(),
    supabaseAdmin
      .from("landing_page_variants")
      .select("accent_color")
      .eq("is_live", true)
      .maybeSingle(),
  ]);

  return (
    <LoginForm
      accentColor={liveVariant?.accent_color ?? "#B5562F"}
      backgroundImage={settings?.login_background_image ?? null}
    />
  );
}
