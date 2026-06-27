import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/admins
//
// Lists every platform admin account — lets you see who else has access
// at this level (useful once there's more than one of you).
// ----------------------------------------------------------------------------
export async function GET() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id, email, name, active, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ admins: data ?? [] });
}

// ----------------------------------------------------------------------------
// POST /api/platform-admin/admins
//
// Adds a new platform admin account — this is how every platform admin
// AFTER the very first one (created via the one-time SQL seed) gets
// created: through the dashboard itself, by an existing platform admin.
// Per your request for "option to change/add new account/password
// inside my dashboard."
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, email, password } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Name, email, and password are all required." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing } = await supabaseAdmin
    .from("platform_admins")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A platform admin with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { data: newAdmin, error } = await supabaseAdmin
    .from("platform_admins")
    .insert({ name: name.trim(), email: normalizedEmail, password_hash: passwordHash })
    .select("id, name, email, active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ admin: newAdmin });
}
