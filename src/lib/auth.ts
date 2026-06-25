import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./supabaseAdmin";

export type LoginResult =
  | {
      success: true;
      user: {
        userId: string;
        companyId: string;
        companyCode: string;
        role: string;
        name: string;
        email: string;
      };
    }
  | { success: false; error: string };

// ----------------------------------------------------------------------------
// authenticateUser
//
// This implements the 3-field login you specified: Company / Email / Password.
//
// Why "company" first: emails are only unique WITHIN a company (see the
// uq_users_company_email constraint), so we can't look a user up by email
// alone — "admin@sterling.com" could theoretically exist at two different
// companies with totally different passwords. The company_code disambiguates
// which tenant we're even looking in before we touch the users table.
//
// We use supabaseAdmin (service role, bypasses RLS) here deliberately:
// at this point in the flow we don't have a session yet, so there's no
// company_id to scope RLS by. This is the one legitimate "crosses tenant
// boundaries" operation in the whole app, and it's read-only + tightly
// scoped to exactly the company_code provided.
// ----------------------------------------------------------------------------
export async function authenticateUser(
  companyCode: string,
  email: string,
  password: string
): Promise<LoginResult> {
  const normalizedCompanyCode = companyCode.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Find the company by its code
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, company_code, status")
    .eq("company_code", normalizedCompanyCode)
    .maybeSingle();

  if (companyError) {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  if (!company) {
    return { success: false, error: "Company, email, or password is incorrect." };
  }
  if (company.status !== "active") {
    return {
      success: false,
      error: "This account is suspended. Please contact support.",
    };
  }

  // 2. Find the user within that company
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, company_id, name, email, password_hash, role, active")
    .eq("company_id", company.id)
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (userError) {
    return { success: false, error: "Something went wrong. Please try again." };
  }

  // Deliberately vague error message below (same wording as "company not
  // found") so we don't leak whether a company code or an email exists.
  if (!user || !user.active) {
    return { success: false, error: "Company, email, or password is incorrect." };
  }

  // 3. Verify password
  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return { success: false, error: "Company, email, or password is incorrect." };
  }

  return {
    success: true,
    user: {
      userId: user.id,
      companyId: user.company_id,
      companyCode: company.company_code,
      role: user.role,
      name: user.name,
      email: user.email,
    },
  };
}
