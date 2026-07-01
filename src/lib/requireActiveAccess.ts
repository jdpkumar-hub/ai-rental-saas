import { supabaseAdmin } from "./supabaseAdmin";
import { getTrialStatus } from "./trialStatus";

// ----------------------------------------------------------------------------
// requireActiveAccess
//
// The gate that decides whether a logged-in tenant may use the dashboard, or
// must be sent to /billing to subscribe. Call this from the dashboard layout
// (server component) with the companyId from the verified session.
//
// A company may use the app if EITHER:
//   - they have an active paid subscription (companies.stripe_subscription_id
//     set AND status = 'active' AND not past their current period end), OR
//   - they are still within an unexpired trial.
//
// Otherwise (trial expired and no active subscription) access is blocked and
// the caller should redirect to /billing.
//
// Returns a small verdict object rather than throwing/redirecting itself, so
// the layout stays in control of navigation (redirect() must be called from
// the component, not a lib function).
// ----------------------------------------------------------------------------

export type AccessVerdict = {
  allowed: boolean;
  reason: "active_subscription" | "trial" | "trial_expired" | "no_subscription";
  trialDaysRemaining: number | null;
};

export async function requireActiveAccess(companyId: string): Promise<AccessVerdict> {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select(
      "status, subscription_plan, stripe_subscription_id, subscription_current_period_end"
    )
    .eq("id", companyId)
    .maybeSingle();

  // Fail safe: if we can't read the company, don't lock them out of billing.
  if (!company) {
    return { allowed: false, reason: "no_subscription", trialDaysRemaining: null };
  }

  // 1. Active paid subscription?
  const hasSubId = !!company.stripe_subscription_id;
  const isActive = company.status === "active";
  const periodEnd = company.subscription_current_period_end
    ? new Date(company.subscription_current_period_end)
    : null;
  const periodStillValid = periodEnd ? periodEnd.getTime() > Date.now() : false;

  if (hasSubId && isActive && periodStillValid) {
    return { allowed: true, reason: "active_subscription", trialDaysRemaining: null };
  }

  // 2. Still on an unexpired trial?
  const trial = await getTrialStatus(companyId);
  if (trial.isTrial && !trial.isExpired) {
    return { allowed: true, reason: "trial", trialDaysRemaining: trial.daysRemaining };
  }

  // 3. Trial expired (or never had a subscription) -> blocked.
  if (trial.isTrial && trial.isExpired) {
    return { allowed: false, reason: "trial_expired", trialDaysRemaining: 0 };
  }

  return { allowed: false, reason: "no_subscription", trialDaysRemaining: null };
}
