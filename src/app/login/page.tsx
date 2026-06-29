import { supabaseAdmin } from "@/lib/supabaseAdmin";
import LoginForm from "./LoginForm";

// ----------------------------------------------------------------------------
// Server component wrapper for the login page -- fetches the configured
// background color/image once, server-side, and passes it down to the
// actual interactive form (LoginForm.tsx). Split this way because the
// form itself needs client-side state (controlled inputs, submit
// handling) but the background setting is simple server data with no
// need for its own client-side fetch + loading state.
// ----------------------------------------------------------------------------
export default async function LoginPage() {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("login_background_color, login_background_image")
    .eq("id", 1)
    .maybeSingle();

  return (
    <LoginForm
      backgroundColor={data?.login_background_color ?? "#F4EEE3"}
      backgroundImage={data?.login_background_image ?? null}
    />
  );
}
