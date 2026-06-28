import { supabaseAdmin } from "./supabaseAdmin";

export type TrialStatus = {
  isExpired: boolean;
  isTrial: boolean;
  trialEndsAt: string | null;
  daysRemaining: number | null;
};

// ----------------------------------------------------------------------------
// getTrialStatus
//
// Single source of truth for "is this company's trial expired" — used
// both by the dashboard layout (to actually block access) and by the
// trial-expired page itself (to show an accurate message). Centralizing
// this avoids subtly different expiration logic existing in two places.
//
// A company NOT on the trial plan (e.g. "active", "starter", "pro") is
// never considered expired here, regardless of trial_ends_at — those
// dates only matter while subscription_plan is still "trial". Once a
// platform admin moves a company off trial, this check becomes a no-op
// for them permanently (until/unless they're ever moved back to trial).
// ----------------------------------------------------------------------------
export async function getTrialStatus(companyId: string): Promise<TrialStatus> {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("subscription_plan, trial_ends_at")
    .eq("id", companyId)
    .maybeSingle();

  if (!company || company.subscription_plan !== "trial") {
    return { isExpired: false, isTrial: false, trialEndsAt: null, daysRemaining: null };
  }

  if (!company.trial_ends_at) {
    return { isExpired: false, isTrial: true, trialEndsAt: null, daysRemaining: null };
  }

  const endsAt = new Date(company.trial_ends_at);
  const now = new Date();
  const isExpired = now >= endsAt;
  const daysRemaining = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    isExpired,
    isTrial: true,
    trialEndsAt: company.trial_ends_at,
    daysRemaining: isExpired ? 0 : daysRemaining,
  };
}
