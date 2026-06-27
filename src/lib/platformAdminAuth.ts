import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./supabaseAdmin";

export type PlatformAdminLoginResult =
  | { success: true; admin: { adminId: string; email: string; name: string } }
  | { success: false; error: string };

// ----------------------------------------------------------------------------
// authenticatePlatformAdmin
//
// Deliberately simpler than the company-level authenticateUser in
// src/lib/auth.ts: just email + password, no company code, since a
// platform admin isn't scoped to any company. Looks up directly in
// `platform_admins`, a completely separate table from `users`.
// ----------------------------------------------------------------------------
export async function authenticatePlatformAdmin(
  email: string,
  password: string
): Promise<PlatformAdminLoginResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: admin, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id, email, password_hash, name, active")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    return { success: false, error: "Something went wrong. Please try again." };
  }

  if (!admin || !admin.active) {
    return { success: false, error: "Email or password is incorrect." };
  }

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);
  if (!passwordMatches) {
    return { success: false, error: "Email or password is incorrect." };
  }

  return {
    success: true,
    admin: { adminId: admin.id, email: admin.email, name: admin.name },
  };
}
