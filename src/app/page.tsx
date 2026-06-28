import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// ----------------------------------------------------------------------------
// Root page.
//
// Each landing page variant (see migration 0012) is a COMPLETE standalone
// HTML document — its own <!DOCTYPE>, <head>, fonts, <style>, <body>.
// That's fundamentally incompatible with rendering through the shared
// src/app/layout.tsx React tree, which already provides its own
// <html><body> wrapper — you can't validly nest one full HTML document
// inside another.
//
// The fix: middleware.ts intercepts every unauthenticated GET / BEFORE
// Next.js ever reaches this page component, and returns the live
// variant's raw HTML directly as the HTTP response (see middleware.ts
// for that logic). This page.tsx component therefore only ever actually
// executes for the logged-in case — redirecting straight to /dashboard,
// same as the very first version of this file did. If you're reading
// this function body, you're logged in.
// ----------------------------------------------------------------------------
export default async function RootPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  // Defensive fallback only — middleware should have already handled
  // every unauthenticated request before it gets here.
  redirect("/login");
}
