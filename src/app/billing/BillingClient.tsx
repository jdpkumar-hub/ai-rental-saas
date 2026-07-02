"use client";

import { useState } from "react";

// ----------------------------------------------------------------------------
// BillingClient
//
// Interactive part of /billing: pick a billing cycle, pick a plan, continue
// to payment -> POST to the checkout endpoint -> redirect to Stripe.
//
// Uses the app's CSS design tokens (--color-surface, --color-clay,
// --font-display, --font-mono, etc.) so it inherits the same look and the
// per-company brand color as the rest of the dashboard, rather than
// hardcoding hex values.
// ----------------------------------------------------------------------------

type Cycle = "monthly" | "quarterly" | "yearly";

export type BillingPlan = {
  plan_key: string;
  name: string;
  description: string | null;
  monthly_fee: number;
  quarterly_fee: number;
  yearly_fee: number;
  features: string[];
};

type Props = {
  plans: BillingPlan[];
  trialExpired: boolean;
  trialDaysRemaining: number | null;
  setupFeeDollars: number;
};

const CYCLE_LABELS: Record<Cycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const CYCLE_SUFFIX: Record<Cycle, string> = {
  monthly: "/mo",
  quarterly: "/3 mo",
  yearly: "/yr",
};

function feeForCycle(plan: BillingPlan, cycle: Cycle): number {
  if (cycle === "monthly") return plan.monthly_fee;
  if (cycle === "quarterly") return plan.quarterly_fee;
  return plan.yearly_fee;
}

function effectiveMonthly(plan: BillingPlan, cycle: Cycle): number {
  if (cycle === "monthly") return plan.monthly_fee;
  if (cycle === "quarterly") return plan.quarterly_fee / 3;
  return plan.yearly_fee / 12;
}

function formatUSD(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function BillingClient({ plans, trialExpired, trialDaysRemaining, setupFeeDollars }: Props) {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<string>(plans[0]?.plan_key ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    if (!selectedPlan) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: selectedPlan, cycle }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Could not start checkout. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      {trialExpired ? (
        <div style={{ ...styles.banner, borderColor: "var(--color-clay)" }}>
          <strong style={{ color: "var(--color-clay)" }}>Your trial has ended.</strong>{" "}
          Choose a plan below to keep your assistant answering calls. Your data and
          settings are exactly where you left them.
        </div>
      ) : trialDaysRemaining !== null ? (
        <div style={styles.banner}>
          You have{" "}
          <strong>
            {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"}
          </strong>{" "}
          left in your trial. Subscribe any time to continue without interruption.
        </div>
      ) : null}

      {/* Cycle toggle */}
      <div role="tablist" aria-label="Billing cycle" style={styles.toggle}>
        {(Object.keys(CYCLE_LABELS) as Cycle[]).map((c) => {
          const active = c === cycle;
          return (
            <button
              key={c}
              role="tab"
              aria-selected={active}
              onClick={() => setCycle(c)}
              style={{
                ...styles.toggleButton,
                background: active ? "var(--color-clay)" : "transparent",
                color: active ? "#fff" : "var(--color-ink)",
              }}
            >
              {CYCLE_LABELS[c]}
            </button>
          );
        })}
      </div>

      {/* Plan cards */}
      <div style={styles.grid}>
        {plans.map((plan) => {
          const selected = plan.plan_key === selectedPlan;
          const headline = feeForCycle(plan, cycle);
          const perMonth = effectiveMonthly(plan, cycle);
          return (
            <button
              key={plan.plan_key}
              onClick={() => setSelectedPlan(plan.plan_key)}
              style={{
                ...styles.planCard,
                border: selected
                  ? "2px solid var(--color-clay)"
                  : "1px solid var(--color-border)",
                boxShadow: selected ? "var(--shadow-card)" : "none",
              }}
            >
              <div style={styles.planName}>{plan.name}</div>

              <div style={styles.priceRow}>
                <span style={styles.price}>{formatUSD(headline)}</span>
                <span style={styles.priceSuffix}>{CYCLE_SUFFIX[cycle]}</span>
              </div>

              {cycle !== "monthly" && (
                <div style={styles.effective}>{formatUSD(perMonth)}/mo effective</div>
              )}

              {plan.description && <p style={styles.planDesc}>{plan.description}</p>}

              <ul style={styles.featureList}>
                {plan.features.map((f, i) => (
                  <li key={i} style={styles.feature}>
                    <span aria-hidden style={{ color: "var(--color-clay)" }}>
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div
                style={{
                  ...styles.selectState,
                  color: selected ? "var(--color-clay)" : "var(--color-ink-muted)",
                }}
              >
                {selected ? "Selected" : "Select this plan"}
              </div>
            </button>
          );
        })}
      </div>

      {setupFeeDollars > 0 && (
        <div style={styles.setupFee}>
          <strong>Note:</strong> your first payment includes a one-time onboarding
          setup fee of <strong>{formatUSD(setupFeeDollars)}</strong>, in addition to
          your selected plan. This is charged once; renewals are the plan price only.
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <button
        onClick={startCheckout}
        disabled={loading || !selectedPlan}
        style={{
          ...styles.cta,
          opacity: loading || !selectedPlan ? 0.6 : 1,
          cursor: loading || !selectedPlan ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Starting secure checkout…" : "Continue to payment"}
      </button>

      <p style={styles.fine}>
        Payments are processed securely by Stripe. You can change or cancel your
        plan at any time.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 1040,
    margin: "0 auto",
    padding: "0 32px",
    color: "var(--color-ink)",
  },
  banner: {
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 28,
    fontSize: 14.5,
    lineHeight: 1.5,
  },
  toggle: {
    display: "inline-flex",
    border: "1px solid var(--color-border)",
    borderRadius: 999,
    padding: 4,
    marginBottom: 28,
    background: "var(--color-surface)",
  },
  toggleButton: {
    border: "none",
    cursor: "pointer",
    padding: "8px 20px",
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 20,
    marginBottom: 32,
  },
  planCard: {
    textAlign: "left",
    cursor: "pointer",
    background: "var(--color-surface)",
    borderRadius: 12,
    padding: 24,
  },
  planName: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--color-ink-muted)",
    marginBottom: 10,
  },
  priceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 2,
  },
  price: {
    fontFamily: "var(--font-mono)",
    fontSize: 30,
    fontWeight: 700,
    color: "var(--color-ink)",
  },
  priceSuffix: {
    color: "var(--color-ink-muted)",
    fontSize: 14,
  },
  effective: {
    fontSize: 13,
    color: "var(--color-ink-muted)",
    marginBottom: 12,
  },
  planDesc: {
    fontSize: 14,
    color: "var(--color-ink-muted)",
    margin: "10px 0 16px",
    lineHeight: 1.5,
  },
  featureList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: 8,
  },
  feature: {
    fontSize: 14,
    color: "var(--color-ink)",
    display: "flex",
    gap: 8,
    lineHeight: 1.4,
  },
  selectState: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: 600,
  },
  error: {
    border: "1px solid var(--color-clay)",
    background: "var(--color-surface)",
    color: "var(--color-clay-dark)",
    borderRadius: 10,
    padding: "12px 16px",
    marginBottom: 16,
    fontSize: 14,
  },
  setupFee: {
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    borderRadius: 10,
    padding: "12px 16px",
    marginBottom: 16,
    fontSize: 13.5,
    color: "var(--color-ink-muted)",
    lineHeight: 1.5,
  },
  cta: {
    border: "none",
    background: "var(--color-clay)",
    color: "#fff",
    fontSize: 15.5,
    fontWeight: 600,
    padding: "14px 28px",
    borderRadius: "var(--radius)",
  },
  fine: {
    fontSize: 12.5,
    color: "var(--color-ink-muted)",
    marginTop: 12,
  },
};
