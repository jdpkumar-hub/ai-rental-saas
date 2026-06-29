import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PlatformLoginForm from "./PlatformLoginForm";

// ----------------------------------------------------------------------------
// Server component wrapper -- fetches the platform-admin-specific
// background settings (separate from the company login's settings, see
// migration 0014) and passes them down to the interactive form.
// ----------------------------------------------------------------------------
export default async function PlatformAdminLoginPage() {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("platform_login_background_color, platform_login_background_image")
    .eq("id", 1)
    .maybeSingle();

  return (
    <PlatformLoginForm
      backgroundColor={data?.platform_login_background_color ?? "#1C1815"}
      backgroundImage={data?.platform_login_background_image ?? null}
    />
  );
}
