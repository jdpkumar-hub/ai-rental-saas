import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTrialStatus } from "@/lib/trialStatus";
import BillingClient, { BillingPlan } from "./BillingClient";

// ----------------------------------------------------------------------------
// /billing  (tenant-facing)
//
// Where a tenant lands to subscribe -- voluntarily during a trial, or because
// the dashboard access-guard sent them here after their trial expired.
//
// Server component: verifies the company session, loads the active pricing
// plans + this company's brand color + trial status, and injects the brand
// color as the --color-clay / --color-clay-dark CSS variables (same as the
// dashboard layout does) so this page -- which lives OUTSIDE /dashboard and
// therefore doesn't inherit that layout's injection -- still shows the
// company's own accent color. Then it renders the interactive picker.
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

// features may be stored as newline text (the platform-admin "one per line"
// textarea) or a JSON array -- normalize both into string[].
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

function isValidHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(value);
}

function darkenHexColor(hex: string, amount: number): string {
  const normalized =
    hex.length === 4 ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const darken = (ch: number) => Math.max(0, Math.round(ch * (1 - amount)));
  const toHex = (ch: number) => ch.toString(16).padStart(2, "0");
  return `#${toHex(darken(r))}${toHex(darken(g))}${toHex(darken(b))}`;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Just completed checkout? The webhook has (near-instantly) marked this
  // company active; send them into the dashboard, where the access guard
  // will confirm the subscription and admit them. Avoids leaving a paying
  // tenant staring at the plan picker after a successful payment.
  if (searchParams?.status === "success") {
    redirect("/dashboard");
  }

  const { companyId } = session;

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

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("company_name, brand_color, setup_fee_cents, setup_fee_paid_at")
    .eq("id", companyId)
    .maybeSingle();

  const brandColor =
    company?.brand_color && isValidHexColor(company.brand_color)
      ? company.brand_color
      : "#B5562F";
  const brandColorDark = darkenHexColor(brandColor, 0.22);

  const trial = await getTrialStatus(companyId);

  // Setup fee: only owed if non-zero and not already paid. Shown on the page
  // so the tenant knows the first charge includes it.
  const setupFeeCents = Number(company?.setup_fee_cents ?? 0);
  const setupFeeOwed = setupFeeCents > 0 && !company?.setup_fee_paid_at;
  const setupFeeDollars = setupFeeOwed ? setupFeeCents / 100 : 0;

  return (
    <div
      style={
        {
          "--color-clay": brandColor,
          "--color-clay-dark": brandColorDark,
          background: "var(--color-bg)",
          minHeight: "100vh",
          paddingTop: 48,
          paddingBottom: 64,
        } as React.CSSProperties
      }
    >
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 32px 24px" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 600,
            color: "var(--color-ink)",
            margin: "0 0 8px",
          }}
        >
          Choose your plan
        </h1>
        <p
          style={{
            color: "var(--color-ink-muted)",
            fontSize: 14.5,
            margin: 0,
            maxWidth: 560,
            lineHeight: 1.5,
          }}
        >
          {company?.company_name ?? "Your company"} — pick the plan and billing cycle
          that fits, then continue to secure payment.
        </p>
      </div>

      <BillingClient
        plans={plans}
        trialExpired={trial.isExpired}
        trialDaysRemaining={trial.isExpired ? null : trial.daysRemaining}
        setupFeeDollars={setupFeeDollars}
      />
    </div>
  );
}
