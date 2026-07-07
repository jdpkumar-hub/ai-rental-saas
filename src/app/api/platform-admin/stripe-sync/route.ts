import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

// ----------------------------------------------------------------------------
// POST /api/platform-admin/stripe-sync
//
// One-time (or re-run-as-needed) setup action: for every active pricing
// plan, creates a Stripe Product (if this plan doesn't already have one
// recorded) and three Stripe Prices under it -- one each for monthly,
// quarterly, yearly -- using the dollar amounts currently stored in
// pricing_plans. Writes the resulting IDs back onto each plan row.
//
// IMPORTANT: we look up an existing product via our OWN stored
// stripe_product_id column, not via Stripe's Search API. Stripe's
// product search is explicitly documented as eventually consistent
// ("don't use search in read-after-write flows... data is searchable
// in under 1 minute") -- if this route were run twice back-to-back, a
// search-based lookup could fail to find a Product created moments
// earlier and create a duplicate. Storing the ID ourselves makes this
// fully reliable regardless of timing.
//
// Re-running this after editing a price creates NEW Stripe Price
// objects (Stripe Prices can't be edited once created) and overwrites
// the stored Price IDs -- existing subscriptions keep their old price
// until changed, but any NEW checkout uses the freshly-created one.
// This is standard Stripe practice: "changing a price" really means
// "create a new Price and point new sign-ups at it."
// ----------------------------------------------------------------------------
export async function POST() {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data: plans, error } = await supabaseAdmin
    .from("pricing_plans")
    .select("*")
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    plan_key: string;
    status: string;
    error?: string;
    warning?: string;
  }> = [];

  for (const plan of plans ?? []) {
    // Safety net: quarterly/yearly are normally derived from monthly
    // (15% / 30% off — auto-filled in the admin UI). Deliberate
    // overrides are allowed, but a LARGE deviation usually means a
    // stale value (e.g. monthly was changed and the others weren't).
    // We still sync — this is a warning, not a block.
    let warning: string | undefined;
    const expectedQuarterly = Math.round(plan.monthly_fee * 3 * 0.85);
    const expectedYearly = Math.round(plan.monthly_fee * 12 * 0.7);
    const drift = (actual: number, expected: number) =>
      expected > 0 && Math.abs(actual - expected) / expected > 0.05;

    if (drift(plan.quarterly_fee, expectedQuarterly) || drift(plan.yearly_fee, expectedYearly)) {
      warning =
        `Prices deviate >5% from the 15%/30% pattern ` +
        `(expected quarterly ~$${expectedQuarterly}, yearly ~$${expectedYearly}; ` +
        `stored quarterly $${plan.quarterly_fee}, yearly $${plan.yearly_fee}). ` +
        `Synced anyway — verify this is intentional.`;
    }

    try {
      let productId: string = plan.stripe_product_id;

      if (!productId) {
        const product = await stripe.products.create({
          name: plan.name,
          description: plan.description,
          metadata: { plan_key: plan.plan_key },
        });
        productId = product.id;
      }

      const monthlyPrice = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: plan.monthly_fee * 100,
        recurring: { interval: "month" },
        metadata: { plan_key: plan.plan_key, cycle: "monthly" },
      });

      const quarterlyPrice = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: plan.quarterly_fee * 100,
        recurring: { interval: "month", interval_count: 3 },
        metadata: { plan_key: plan.plan_key, cycle: "quarterly" },
      });

      const yearlyPrice = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: plan.yearly_fee * 100,
        recurring: { interval: "year" },
        metadata: { plan_key: plan.plan_key, cycle: "yearly" },
      });

      await supabaseAdmin
        .from("pricing_plans")
        .update({
          stripe_product_id: productId,
          stripe_price_id_monthly: monthlyPrice.id,
          stripe_price_id_quarterly: quarterlyPrice.id,
          stripe_price_id_yearly: yearlyPrice.id,
        })
        .eq("id", plan.id);

      results.push({ plan_key: plan.plan_key, status: "synced", warning });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ plan_key: plan.plan_key, status: "failed", error: message, warning });
    }
  }

  return NextResponse.json({ results });
}
