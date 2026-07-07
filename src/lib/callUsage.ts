// ----------------------------------------------------------------------------
// src/lib/callUsage.ts
//
// Call-cap tracking + overage billing helpers.
//
// Model:
//   - Caps are PER CALENDAR MONTH (resets on the 1st), regardless of the
//     company's billing cycle. Simple to reason about and to explain to
//     tenants ("100 calls per month").
//   - companies.call_limit: monthly included calls. NULL = unlimited.
//   - companies.overage_price_cents: price per call beyond the cap
//     (default 99 = $0.99). Editable per company in platform-admin.
//   - A call that STARTS after the cap is reached is flagged is_overage
//     at call start (voice/incoming). When the call ENDS, a Stripe
//     InvoiceItem is created (voice/recording-complete) — Stripe
//     automatically attaches pending invoice items to the customer's
//     NEXT subscription invoice, so there is no separate charge or
//     checkout. calls.overage_invoice_item_id guards against Twilio
//     callback retries double-billing the same call.
//
// Known v1 limitations (acceptable, revisit later):
//   - Quarterly/yearly subscribers accumulate overage items until their
//     next (quarterly/yearly) invoice. If that's too slow, a monthly
//     cron can sweep pending items into a standalone invoice.
//   - Trial companies (no stripe_customer_id) can exceed the cap; the
//     calls are flagged is_overage but nothing is billed.
// ----------------------------------------------------------------------------

import { stripe } from "@/lib/stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// First instant of the current calendar month (UTC).
export function currentMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// How many calls this company has received so far this calendar month.
export async function countCallsThisMonth(
  db: SupabaseClient,
  companyId: string
): Promise<number> {
  const { count, error } = await db
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("created_at", currentMonthStartIso());

  if (error) {
    console.error("[callUsage] Failed to count monthly calls:", error);
    // Fail OPEN: if the count query breaks, treat as under the cap —
    // never refuse/misbill a caller because of our own DB hiccup.
    return 0;
  }
  return count ?? 0;
}

// Is the NEXT call (the one about to be created) beyond the cap?
// `callsSoFar` = count BEFORE this call. NULL limit = unlimited.
export function isOverageCall(
  callsSoFar: number,
  callLimit: number | null
): boolean {
  if (callLimit === null || callLimit === undefined) return false;
  return callsSoFar >= callLimit;
}

// Create the $-per-call overage InvoiceItem on the company's Stripe
// customer. Returns the InvoiceItem id, or null if billing wasn't
// possible (no Stripe customer, zero price, etc).
export async function billOverageCall({
  stripeCustomerId,
  overagePriceCents,
  companyName,
  callSid,
}: {
  stripeCustomerId: string | null;
  overagePriceCents: number;
  companyName: string;
  callSid: string;
}): Promise<string | null> {
  if (!stripeCustomerId || overagePriceCents <= 0) return null;

  try {
    const item = await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      amount: overagePriceCents,
      currency: "usd",
      description: `Overage call (beyond monthly included calls) — ${companyName} — CallSid ${callSid}`,
    });
    return item.id;
  } catch (err) {
    console.error("[callUsage] Failed to create overage invoice item:", err);
    return null;
  }
}
