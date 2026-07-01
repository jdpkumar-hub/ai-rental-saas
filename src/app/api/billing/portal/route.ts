import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/requireTenant";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";

// ----------------------------------------------------------------------------
// POST /api/billing/portal
//
// Creates a Stripe Billing Portal session for the logged-in tenant and returns
// its URL. The Billing Portal is Stripe-hosted UI where a customer can update
// their card, change plan, view invoices, and cancel -- so we don't have to
// build any of that ourselves. We just hand Stripe the customer id and a
// return URL, and redirect the tenant there.
//
// Requires the company to already have a stripe_customer_id (i.e. they've been
// through checkout at least once). A tenant who has never subscribed has no
// customer to manage -- they should use /billing to subscribe first.
// ----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const guard = await requireTenant();
  if ("response" in guard) return guard.response;
  const { companyId } = guard.session;

  const { data: company, error } = await supabaseAdmin
    .from("companies")
    .select("stripe_customer_id")
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!company?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No subscription found. Please choose a plan first." },
      { status: 409 }
    );
  }

  try {
    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://ai-rental-saas.vercel.app";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${origin}/dashboard/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
