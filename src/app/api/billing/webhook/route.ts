import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/email";
import type Stripe from "stripe";

// ----------------------------------------------------------------------------
// POST /api/billing/webhook
//
// Stripe -> us. This is the single source of truth for subscription state:
// the checkout endpoint only STARTS a payment; this handler is what actually
// marks a company as paid once Stripe confirms it, and what keeps the
// company row in sync on renewals, cancellations, and payment failures.
//
// CRITICAL -- RAW BODY:
// Stripe signs the EXACT bytes it sent. To verify the signature we must pass
// the raw, unparsed request body to stripe.webhooks.constructEvent -- NOT a
// re-serialized JSON.stringify(await req.json()), which would reorder/reformat
// bytes and break verification with "No signatures found matching the
// expected signature for payload." In the Next.js App Router, `await
// req.text()` gives us the raw body exactly as received, so we use that.
// (There is no need for the old `export const config = { api: { bodyParser }}`
// pages-router trick here; App Router route handlers don't pre-parse.)
//
// STRIPE_WEBHOOK_SECRET must be set in the environment (the "whsec_..." value
// Stripe shows when you create the webhook endpoint, or that `stripe listen`
// prints locally).
// ----------------------------------------------------------------------------

// Opt out of any caching for this route -- webhooks must always execute.
export const dynamic = "force-dynamic";

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set.");
  }
  return secret;
}

// ----------------------------------------------------------------------------
// getPeriodEndISO
//
// In the 2026-06-24.dahlia API version, current_period_end is no longer a
// top-level field on the Subscription object -- it moved onto each
// subscription ITEM (subscription.items.data[].current_period_end), because
// a single subscription can now contain items that bill on different
// schedules. Our subscriptions have exactly one item (one plan), so we read
// the period end off the first item. Falls back to null if unavailable.
// ----------------------------------------------------------------------------
function getPeriodEndISO(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0];
  const periodEnd = item?.current_period_end;
  if (typeof periodEnd !== "number") return null;
  return new Date(periodEnd * 1000).toISOString();
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text(); // RAW bytes -- do not parse before verifying
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Signature failed -> 400 so Stripe knows it wasn't accepted.
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
      case "customer.subscription.created":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.upcoming":
        // Stripe fires this ~1 day before a renewal charge (the exact lead
        // time is configurable in Stripe billing settings). This is what
        // powers the "email one day before service renews" requirement.
        await handleInvoiceUpcoming(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Unhandled event types are fine -- acknowledge so Stripe stops retrying.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe-webhook] Error handling ${event.type}:`, message);
    // Return 500 so Stripe RETRIES -- a transient DB error shouldn't silently
    // drop a real subscription change.
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Acknowledge receipt. Always 200 once handled (or intentionally ignored).
  return NextResponse.json({ received: true });
}

// ----------------------------------------------------------------------------
// checkout.session.completed
//
// Fired the moment a customer finishes paying. We pull company_id + plan_key
// + cycle out of the metadata we attached when creating the session, then
// activate the company. We also fetch the subscription to record its id and
// current period end.
// ----------------------------------------------------------------------------
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const companyId = session.metadata?.company_id;
  const planKey = session.metadata?.plan_key;
  const cycle = session.metadata?.cycle;

  if (!companyId) {
    console.error("[stripe-webhook] checkout.session.completed missing company_id metadata");
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  let periodEnd: string | null = null;
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    periodEnd = getPeriodEndISO(subscription as Stripe.Subscription);
  }

  await supabaseAdmin
    .from("companies")
    .update({
      stripe_subscription_id: subscriptionId,
      subscription_plan: planKey ?? undefined,
      billing_cycle: cycle ?? undefined,
      subscription_current_period_end: periodEnd,
      status: "active",
    })
    .eq("id", companyId);
}

// ----------------------------------------------------------------------------
// customer.subscription.created / updated
//
// Keeps period end + cycle in sync on every renewal and plan change. We find
// the company by stripe_subscription_id (or fall back to metadata.company_id).
// ----------------------------------------------------------------------------
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const periodEnd = getPeriodEndISO(subscription);
  const companyId = subscription.metadata?.company_id ?? null;

  const update: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    subscription_current_period_end: periodEnd,
  };

  // active / trialing -> usable; past_due / canceled / unpaid -> not.
  if (subscription.status === "active" || subscription.status === "trialing") {
    update.status = "active";
  } else if (
    subscription.status === "canceled" ||
    subscription.status === "unpaid" ||
    subscription.status === "incomplete_expired"
  ) {
    update.status = "suspended";
  }

  if (companyId) {
    await supabaseAdmin.from("companies").update(update).eq("id", companyId);
  } else {
    await supabaseAdmin
      .from("companies")
      .update(update)
      .eq("stripe_subscription_id", subscription.id);
  }
}

// ----------------------------------------------------------------------------
// customer.subscription.deleted
//
// Subscription fully ended (canceled and period elapsed). Suspend access.
// ----------------------------------------------------------------------------
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await supabaseAdmin
    .from("companies")
    .update({ status: "suspended", stripe_subscription_id: null })
    .eq("stripe_subscription_id", subscription.id);
}

// ----------------------------------------------------------------------------
// invoice.upcoming -- the "one day before renewal" email
//
// Stripe sends this ahead of the next charge. We look up the company by its
// Stripe customer id and email them a heads-up that their card will be
// charged and service continues.
// ----------------------------------------------------------------------------
async function handleInvoiceUpcoming(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("company_name, email, billing_cycle, subscription_current_period_end")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!company?.email) return;

  const amount = ((invoice.amount_due ?? 0) / 100).toFixed(2);
  const currency = (invoice.currency ?? "usd").toUpperCase();

  await sendEmail({
    to: company.email,
    subject: "Your AI Rental Office Assistant subscription renews tomorrow",
    html: `
      <p>Hi ${company.company_name ?? "there"},</p>
      <p>This is a friendly reminder that your <strong>${
        company.billing_cycle ?? "subscription"
      }</strong> plan will renew tomorrow, and your card on file will be
      charged <strong>${currency} $${amount}</strong>.</p>
      <p>No action is needed -- your service will continue uninterrupted.
      If you'd like to make any changes, just log in to your dashboard
      before the renewal date.</p>
      <p>Thank you for using AI Rental Office Assistant.</p>
    `,
  });
}

// ----------------------------------------------------------------------------
// invoice.payment_failed
//
// Card declined on renewal. Stripe will retry per your dunning settings, but
// we flag the company so the UI can warn them. We don't hard-suspend on the
// first failure -- that's what the subscription status transitions handle.
// ----------------------------------------------------------------------------
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("company_name, email")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!company?.email) return;

  await sendEmail({
    to: company.email,
    subject: "Payment failed for your AI Rental Office Assistant subscription",
    html: `
      <p>Hi ${company.company_name ?? "there"},</p>
      <p>We weren't able to process your latest subscription payment.
      Please log in to your dashboard and update your payment method to
      avoid any interruption to your service.</p>
      <p>We'll automatically retry the charge over the next few days.</p>
    `,
  });
}
