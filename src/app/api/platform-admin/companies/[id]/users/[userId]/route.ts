import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// PATCH /api/platform-admin/companies/[id]/users/[userId]
//
// Lets you reset a forgotten password for any user at any company —
// exactly the gap you ran into: after creating "Emhurst Apartments" you
// had no way to recover or change that admin's password except going
// into Supabase directly. This is that recovery path, built properly.
//
// We re-verify the user actually belongs to the company in the URL
// (rather than trusting userId alone) so there's no way to accidentally
// (or maliciously) reset a DIFFERENT company's user by guessing/reusing
// a userId with the wrong companyId in the path.
// ----------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.password || body.password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const { data: user, error: lookupError } = await supabaseAdmin
    .from("users")
    .select("id, company_id")
    .eq("id", params.userId)
    .eq("company_id", params.id)
    .maybeSingle();

  if (lookupError || !user) {
    return NextResponse.json(
      { error: "User not found at this company." },
      { status: 404 }
    );
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("id", params.userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
