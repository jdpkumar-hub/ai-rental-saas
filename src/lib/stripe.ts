import Stripe from "stripe";

// ----------------------------------------------------------------------------
// Stripe client singleton. STRIPE_SECRET_KEY must be set (test mode
// "sk_test_..." for now, swapped to a live "sk_live_..." key only when
// you're ready to accept real payments -- nothing else in this codebase
// needs to change for that switch, since it's purely an environment
// variable swap).
// ----------------------------------------------------------------------------
function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set.");
  }
  return key;
}

export const stripe = new Stripe(getStripeSecretKey(), {
  apiVersion: "2026-06-24.dahlia",
});
