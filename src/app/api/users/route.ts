import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

const MANAGE_ROLES = ["admin", "manager"];

// ----------------------------------------------------------------------------
// GET /api/users
// GET /api/users?full=1
//
// Two callers use this route with different needs:
//
// 1. The CRM's "Assigned Agent" dropdown (no query param) — just wants
//    active users with minimal fields (id, name, role). Kept as the
//    default response shape so that existing call site keeps working
//    unchanged.
//
// 2. The Phase 7 Users management page (?full=1) — wants everyone
//    (including deactivated users, so they can be reactivated), plus
//    email and created_at, for admins/managers to actually manage the
//    team. Gated to admin/manager roles only, per your choice — agents
//    can still hit the plain (no query param) version for the CRM
//    dropdown, but can't see the full management listing.
// ----------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const full = searchParams.get("full") === "1";

  const tenantDb = await getTenantClient(session.companyId);

  if (full) {
    if (!MANAGE_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Only admins and managers can view the full user list." },
        { status: 403 }
      );
    }

    const { data: users, error } = await tenantDb
      .from("users")
      .select("id, name, email, role, active, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users: users ?? [] });
  }

  const { data: users, error } = await tenantDb
    .from("users")
    .select("id, name, role")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}

// ----------------------------------------------------------------------------
// POST /api/users
//
// Creates a new user at the logged-in admin/manager's company. Per your
// chosen flow (Path B: you create accounts yourself), this sets a
// temporary password directly — no email/invite infrastructure required.
// The new user logs in immediately with the company code, their email,
// and the temporary password you set; nothing stops them from continuing
// to use that same password, though you may want to tell them to change
// it (no "force password change on first login" flow exists yet — that
// would be a reasonable follow-up, not in scope here).
// ----------------------------------------------------------------------------
const VALID_ROLES = ["admin", "manager", "agent"];

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!MANAGE_ROLES.includes(session.role)) {
    return NextResponse.json(
      { error: "Only admins and managers can add users." },
      { status: 403 }
    );
  }

  let body: { name?: string; email?: string; password?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, email, password, role } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json(
      { error: "Name, email, password, and role are all required." },
      { status: 400 }
    );
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
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
  const tenantDb = await getTenantClient(session.companyId);

  // Check for an existing user with this email at this company — the
  // uq_users_company_email constraint would catch this anyway, but a
  // friendly error message is nicer than a raw Postgres constraint
  // violation bubbling up.
  const { data: existing } = await tenantDb
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists at your company." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { data: newUser, error } = await tenantDb
    .from("users")
    .insert({
      name: name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      role,
      active: true,
    })
    .select("id, name, email, role, active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: newUser });
}
