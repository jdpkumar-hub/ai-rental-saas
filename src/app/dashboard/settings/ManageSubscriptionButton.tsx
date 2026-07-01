"use client";

import { useState } from "react";

// ----------------------------------------------------------------------------
// ManageSubscriptionButton
//
// Opens the Stripe Billing Portal so an active subscriber can update their
// card, change plan, view invoices, or cancel. Drop this into the Settings
// page (or anywhere in the dashboard). Uses the app's CSS tokens so it looks
// native. Gated to admins/managers at the call site -- see usage note below.
//
// Usage (e.g. in your Settings client component):
//   import ManageSubscriptionButton from "@/app/dashboard/settings/ManageSubscriptionButton";
//   {(role === "admin" || role === "manager") && <ManageSubscriptionButton />}
// ----------------------------------------------------------------------------
export default function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Could not open the billing portal. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={openPortal}
        disabled={loading}
        style={{
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-ink)",
          fontSize: 13.5,
          fontWeight: 600,
          padding: "10px 18px",
          borderRadius: "var(--radius)",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Opening billing portal…" : "Manage subscription"}
      </button>
      {error && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "var(--color-clay-dark)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
