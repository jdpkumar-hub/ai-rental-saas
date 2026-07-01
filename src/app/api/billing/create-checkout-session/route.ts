import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/requireTenant";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

// ----------------------------------------------------------------------------
// POST /api/billing/create-checkout-session
//
// Called by a logged-in TENANT (company user) -- typically right after their
// 14-day trial expires and they're forced to the checkout page. Flow:
//
//   1. Identify the company from the signed session (never from request body).
//   2. Validate the requested plan_key + cycle against pricing_plans, and
//      read the matching synced Stripe Price ID (created by the platform-admin
//      stripe-sync route).
//   3. Ensure the company has a Stripe Customer -- create + persist one on
//      first checkout (companies.stripe_customer_id).
//   4. Create a Stripe Checkout Session in "subscription" mode pointing at
//      that price, and return its URL for the client to redirect to.
//
// This endpoint deliberately does NOT mark the company as subscribed. That
// only happens once Stripe confirms payment, via the webhook handler -- which
// is the single source of truth for "this company is now paying." Writing
// subscription status here (before payment actually succeeds) would let an
// abandoned checkout look like a paid account.
// ----------------------------------------------------------------------------

const VALID_CYCLES = ["monthly", "quarterly", "yearly"] as const;
type Cycle = (typeof VALID_CYCLES)[number];

const PRICE_COLUMN: Record<Cycle, string> = {
  monthly: "stripe_price_id_monthly",
  quarterly: "stripe_price_id_quarterly",
  yearly: "stripe_price_id_yearly",
};

export async function POST(req: NextRequest) {
  const guard = await requireTenant();
  if ("response" in guard) return guard.response;
  const { companyId } = guard.session;

  // --- parse + validate input -------------------------------------------
  let body: { plan_key?: string; cycle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const planKey = body.plan_key?.trim();
  const cycle = body.cycle?.trim() as Cycle | undefined;

  if (!planKey) {
    return NextResponse.json({ error: "plan_key is required" }, { status: 400 });
  }
  if (!cycle || !VALID_CYCLES.includes(cycle)) {
    return NextResponse.json(
      { error: "cycle must be one of: monthly, quarterly, yearly" },
      { status: 400 }
    );
  }

  // --- look up the company (the tenant record itself) -------------------
  // companies is NOT a company_id-scoped child table, so we read it with
  // supabaseAdmin filtered by the verified session companyId.
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, company_name, email, stripe_customer_id")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // --- look up the plan + the synced price id for the chosen cycle ------
  // Select "*" (a static string) rather than interpolating the dynamic
  // column name into .select() -- a runtime-computed column string makes
  // Supabase's typed query builder return a ParserError type instead of a
  // row, which then can't be indexed. We read the specific price column
  // off the full row below instead.
  const priceColumn = PRICE_COLUMN[cycle];
  const { data: plan, error: planError } = await supabaseAdmin
    .from("pricing_plans")
    .select("*")
    .eq("plan_key", planKey)
    .eq("active", true)
    .maybeSingle();

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 });
  }
  if (!plan) {
    return NextResponse.json(
      { error: `No active plan found for plan_key "${planKey}"` },
      { status: 404 }
    );
  }

  const planRow = plan as unknown as Record<string, string | null>;
  const priceId = planRow[priceColumn];
  if (!priceId) {
    return NextResponse.json(
      {
        error:
          `Plan "${planKey}" has no ${cycle} Stripe price yet. ` +
          `Run "Sync to Stripe" in platform admin first.`,
      },
      { status: 409 }
    );
  }

  try {
    // --- ensure a Stripe Customer exists (create + persist on first use)
    let customerId = company.stripe_customer_id as string | null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: company.company_name,
        email: company.email,
        metadata: { company_id: company.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("companies")
        .update({ stripe_customer_id: customerId })
        .eq("id", company.id);
    }

    // --- create the Checkout Session --------------------------------------
    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://ai-rental-saas.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?status=canceled`,
      // These flow back to us on the webhook so we know which company +
      // plan + cycle this completed checkout corresponds to.
      subscription_data: {
        metadata: {
          company_id: company.id,
          plan_key: planRow.plan_key ?? planKey,
          cycle,
        },
      },
      metadata: {
        company_id: company.id,
        plan_key: planRow.plan_key ?? planKey,
        cycle,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
