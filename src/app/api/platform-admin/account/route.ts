import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// PATCH /api/platform-admin/account
//
// Lets the currently logged-in platform admin change their OWN password.
// Requires the current password to be re-entered (not just "new
// password," which would let anyone with an open, unattended session
// silently take over the account) — same defensive pattern you'd expect
// from any real account settings page.
// ----------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current password and new password are both required." },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const { data: admin, error: fetchError } = await supabaseAdmin
    .from("platform_admins")
    .select("id, password_hash")
    .eq("id", guard.session.adminId)
    .single();

  if (fetchError || !admin) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const currentMatches = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!currentMatches) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 401 }
    );
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  const { error: updateError } = await supabaseAdmin
    .from("platform_admins")
    .update({ password_hash: newHash })
    .eq("id", guard.session.adminId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
