import { supabaseAdmin } from "./supabaseAdmin";
import { getTrialStatus } from "./trialStatus";

// ----------------------------------------------------------------------------
// getBillingStatus
//
// Produces a short, human-readable billing state for a company, for display in
// the Settings billing card (and anywhere else that wants an at-a-glance
// answer to "where does this account stand?"). Mirrors the same precedence as
// requireActiveAccess: an active paid subscription wins; otherwise trial state;
// otherwise expired/none.
//
// Returns:
//   label  -- e.g. "Active until Aug 1, 2026", "Trial — 5 days left",
//             "Trial ended", "No active subscription"
//   tone   -- "good" | "warn" | "bad", so the UI can color it consistently
//   isPaid -- true only when there's an active paid subscription
// ----------------------------------------------------------------------------

export type BillingStatus = {
  label: string;
  tone: "good" | "warn" | "bad";
  isPaid: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function getBillingStatus(companyId: string): Promise<BillingStatus> {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select(
      "status, subscription_plan, billing_cycle, stripe_subscription_id, subscription_current_period_end"
    )
    .eq("id", companyId)
    .maybeSingle();

  if (!company) {
    return { label: "No active subscription", tone: "bad", isPaid: false };
  }

  const hasSubId = !!company.stripe_subscription_id;
  const isActive = company.status === "active";
  const periodEnd = company.subscription_current_period_end
    ? new Date(company.subscription_current_period_end)
    : null;
  const periodStillValid = periodEnd ? periodEnd.getTime() > Date.now() : false;

  // 1. Active paid subscription.
  if (hasSubId && isActive && periodStillValid && periodEnd) {
    const cycle = company.billing_cycle ? `${company.billing_cycle} plan` : "Subscription";
    return {
      label: `${cycle} — renews ${formatDate(periodEnd.toISOString())}`,
      tone: "good",
      isPaid: true,
    };
  }

  // A subscription that exists but is suspended/lapsed.
  if (hasSubId && (!isActive || !periodStillValid)) {
    return {
      label: "Subscription inactive — please update billing",
      tone: "bad",
      isPaid: false,
    };
  }

  // 2. Trial states.
  const trial = await getTrialStatus(companyId);
  if (trial.isTrial && !trial.isExpired) {
    const days = trial.daysRemaining ?? 0;
    return {
      label: `Trial — ${days} day${days === 1 ? "" : "s"} left`,
      tone: days <= 3 ? "warn" : "good",
      isPaid: false,
    };
  }
  if (trial.isTrial && trial.isExpired) {
    return { label: "Trial ended — subscribe to continue", tone: "bad", isPaid: false };
  }

  // 3. Nothing.
  return { label: "No active subscription", tone: "bad", isPaid: false };
}
