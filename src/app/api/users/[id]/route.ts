import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

const MANAGE_ROLES = ["admin", "manager"];
const VALID_ROLES = ["admin", "manager", "agent"];

// ----------------------------------------------------------------------------
// PATCH /api/users/[id]
//
// Lets an admin/manager edit a teammate's name, role, active status, or
// reset their password. Deliberately does NOT allow editing email — email
// is how a user logs in and is unique per company (see Phase 1's
// uq_users_company_email constraint); changing it is more of an account
// recovery action than routine team management, and isn't needed for the
// Path B flow you described.
//
// A user can never deactivate or demote themselves out of admin via this
// route while they're the one making the request — that would let an
// admin accidentally lock themselves out with no other admin able to
// fix it. (We don't currently enforce "at least one admin must always
// exist" company-wide, but blocking self-lockout covers the most common
// accidental case.)
// ----------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!MANAGE_ROLES.includes(session.role)) {
    return NextResponse.json(
      { error: "Only admins and managers can edit users." },
      { status: 403 }
    );
  }

  let body: {
    name?: string;
    role?: string;
    active?: boolean;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const isSelf = params.id === session.userId;

  if (
    isSelf &&
    (body.active === false ||
      (body.role && body.role !== "admin" && session.role === "admin"))
  ) {
    return NextResponse.json(
      { error: "You can't deactivate or demote your own account." },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    updates.name = body.name.trim();
  }

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }
    updates.role = body.role;
  }

  if (body.active !== undefined) {
    updates.active = body.active;
  }

  if (body.password !== undefined) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    updates.password_hash = await bcrypt.hash(body.password, 10);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data: updated, error } = await tenantDb
    .from("users")
    .update(updates)
    .eq("id", params.id)
    .select("id, name, email, role, active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ user: updated });
}
