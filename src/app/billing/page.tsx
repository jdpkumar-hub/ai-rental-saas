import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTrialStatus } from "@/lib/trialStatus";
import BillingClient, { BillingPlan } from "./BillingClient";

// ----------------------------------------------------------------------------
// /billing  (tenant-facing)
//
// Where a tenant lands to subscribe -- either voluntarily (upgrading during a
// trial) or because the trial-guard sent them here after their trial expired.
//
// Server component: verifies the company session, loads the active pricing
// plans and this company's brand color + current status, then hands the
// interactive picker (BillingClient) the data it needs. If a tenant who
// already has an active subscription lands here, we still let them view it
// (they may be changing plans) -- blocking is the layout guard's job, not
// this page's.
// ----------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type PlanRow = {
  plan_key: string;
  name: string;
  description: string | null;
  monthly_fee: number;
  quarterly_fee: number;
  yearly_fee: number;
  features: unknown;
  active: boolean;
};

// features is stored as text (one per line) or a JSON array depending on how
// the platform-admin editor saved it -- normalize both into string[].
function normalizeFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export default async function BillingPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { companyId } = session;

  // Load active plans (source of truth for what a tenant can buy).
  const { data: planRows } = await supabaseAdmin
    .from("pricing_plans")
    .select("plan_key, name, description, monthly_fee, quarterly_fee, yearly_fee, features, active")
    .eq("active", true)
    .order("monthly_fee", { ascending: true });

  const plans: BillingPlan[] = (planRows ?? []).map((p: PlanRow) => ({
    plan_key: p.plan_key,
    name: p.name,
    description: p.description,
    monthly_fee: Number(p.monthly_fee),
    quarterly_fee: Number(p.quarterly_fee),
    yearly_fee: Number(p.yearly_fee),
    features: normalizeFeatures(p.features),
  }));

  // This company's brand color + trial status for the banner.
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("company_name, brand_color")
    .eq("id", companyId)
    .maybeSingle();

  const trial = await getTrialStatus(companyId);

  return (
    <main style={{ background: "#F7F4EC", minHeight: "100vh", paddingTop: 48, paddingBottom: 64 }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 24px" }}>
        <h1
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 40,
            fontWeight: 700,
            color: "#1F2937",
            margin: "0 0 8px",
          }}
        >
          Choose your plan
        </h1>
        <p style={{ color: "#6B6559", fontSize: 16, margin: "0 0 8px", lineHeight: 1.5 }}>
          {company?.company_name ?? "Your company"} — pick the plan and billing cycle
          that fits, then continue to secure payment.
        </p>
      </div>

      <BillingClient
        plans={plans}
        trialExpired={trial.isExpired}
        trialDaysRemaining={trial.isExpired ? null : trial.daysRemaining}
        brandColor={company?.brand_color ?? "#1F3A5F"}
      />
    </main>
  );
}
