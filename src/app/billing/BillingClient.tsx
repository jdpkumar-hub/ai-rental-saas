"use client";

import { useState } from "react";

// ----------------------------------------------------------------------------
// BillingClient
//
// The interactive part of the /billing page: pick a billing cycle, pick a
// plan, click subscribe -> POST to the checkout endpoint -> redirect to
// Stripe. Kept as a client component because it holds selection state and
// fires the fetch; the surrounding page (server component) supplies the data.
//
// Styling matches the existing dashboard: cream surface, navy ink, a serif
// heading upstream, monospace for prices, quiet bordered cards. The one
// accent (the brand navy) is spent on the selected-plan state and the
// subscribe button, so the choice a tenant is making is the loud thing.
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
  brandColor: string;
};

const CYCLE_LABELS: Record<Cycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

// How each cycle's headline number is expressed to the tenant.
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

// Effective monthly cost, so tenants can compare cycles honestly.
function effectiveMonthly(plan: BillingPlan, cycle: Cycle): number {
  if (cycle === "monthly") return plan.monthly_fee;
  if (cycle === "quarterly") return plan.quarterly_fee / 3;
  return plan.yearly_fee / 12;
}

function formatUSD(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function BillingClient({
  plans,
  trialExpired,
  trialDaysRemaining,
  brandColor,
}: Props) {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<string>(plans[0]?.plan_key ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ink = "#1F2937";
  const accent = brandColor || "#1F3A5F";

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
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", color: ink }}>
      {/* Status banner */}
      {trialExpired ? (
        <div
          style={{
            border: `1px solid ${accent}`,
            background: "#FBF7F1",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 28,
          }}
        >
          <strong style={{ color: accent }}>Your trial has ended.</strong>{" "}
          Choose a plan below to keep your assistant answering calls. Your data and
          settings are exactly where you left them.
        </div>
      ) : trialDaysRemaining !== null ? (
        <div
          style={{
            border: "1px solid #E5E0D6",
            background: "#FBF7F1",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 28,
          }}
        >
          You have <strong>{trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"}</strong>{" "}
          left in your trial. Subscribe any time to continue without interruption.
        </div>
      ) : null}

      {/* Cycle toggle */}
      <div
        role="tablist"
        aria-label="Billing cycle"
        style={{
          display: "inline-flex",
          border: "1px solid #E5E0D6",
          borderRadius: 999,
          padding: 4,
          marginBottom: 28,
          background: "#fff",
        }}
      >
        {(Object.keys(CYCLE_LABELS) as Cycle[]).map((c) => {
          const active = c === cycle;
          return (
            <button
              key={c}
              role="tab"
              aria-selected={active}
              onClick={() => setCycle(c)}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "8px 20px",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                background: active ? accent : "transparent",
                color: active ? "#fff" : ink,
                transition: "background 120ms ease",
              }}
            >
              {CYCLE_LABELS[c]}
            </button>
          );
        })}
      </div>

      {/* Plan cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          marginBottom: 32,
        }}
      >
        {plans.map((plan) => {
          const selected = plan.plan_key === selectedPlan;
          const headline = feeForCycle(plan, cycle);
          const perMonth = effectiveMonthly(plan, cycle);
          return (
            <button
              key={plan.plan_key}
              onClick={() => setSelectedPlan(plan.plan_key)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                background: "#fff",
                border: selected ? `2px solid ${accent}` : "1px solid #E5E0D6",
                borderRadius: 14,
                padding: 24,
                boxShadow: selected ? "0 6px 20px rgba(31,58,95,0.10)" : "none",
                transition: "border 120ms ease, box-shadow 120ms ease",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#8A8578",
                  marginBottom: 8,
                }}
              >
                {plan.name}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 32, fontWeight: 700 }}>
                  {formatUSD(headline)}
                </span>
                <span style={{ color: "#8A8578", fontSize: 14 }}>{CYCLE_SUFFIX[cycle]}</span>
              </div>

              {cycle !== "monthly" && (
                <div style={{ fontSize: 13, color: "#8A8578", marginBottom: 12 }}>
                  {formatUSD(perMonth)}/mo effective
                </div>
              )}

              {plan.description && (
                <p style={{ fontSize: 14, color: "#4B5563", margin: "8px 0 16px", lineHeight: 1.5 }}>
                  {plan.description}
                </p>
              )}

              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ fontSize: 14, color: ink, display: "flex", gap: 8 }}>
                    <span aria-hidden style={{ color: accent }}>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div
                style={{
                  marginTop: 16,
                  fontSize: 13,
                  fontWeight: 600,
                  color: selected ? accent : "#8A8578",
                }}
              >
                {selected ? "Selected" : "Select this plan"}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          style={{
            border: "1px solid #E4B4A6",
            background: "#FBEDE9",
            color: "#9C3B22",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={startCheckout}
        disabled={loading || !selectedPlan}
        style={{
          border: "none",
          cursor: loading || !selectedPlan ? "not-allowed" : "pointer",
          background: accent,
          color: "#fff",
          fontSize: 16,
          fontWeight: 600,
          padding: "14px 28px",
          borderRadius: 10,
          opacity: loading || !selectedPlan ? 0.6 : 1,
        }}
      >
        {loading ? "Starting secure checkout…" : "Continue to payment"}
      </button>

      <p style={{ fontSize: 12, color: "#8A8578", marginTop: 12 }}>
        Payments are processed securely by Stripe. You can cancel or change your
        plan at any time.
      </p>
    </div>
  );
}
