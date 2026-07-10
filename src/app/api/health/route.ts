import { NextResponse } from "next/server";

// ----------------------------------------------------------------------------
// GET /api/health
//
// Keep-warm target. An external pinger (cron-job.org) hits this every
// 5 minutes so the Vercel serverless function pool never fully goes
// cold — otherwise the FIRST phone call after an idle stretch pays a
// 1-4 second cold-start penalty before the greeting even starts.
// Deliberately does no DB work: its only job is to keep an instance
// warm, as cheaply as possible.
// ----------------------------------------------------------------------------
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, t: Date.now() });
}
