import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { sendEmail } from "@/lib/email";

// ----------------------------------------------------------------------------
// POST /api/platform-admin/test-email
//
// One-off verification route: confirms GMAIL_USER/GMAIL_APP_PASSWORD are
// correctly set and that real email delivery actually works, before any
// of the trial-reminder or billing logic that depends on it gets built.
// Platform-admin only — this sends a real email, so it shouldn't be
// reachable by anyone else.
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let body: { to?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.to) {
    return NextResponse.json({ error: "Provide a 'to' email address." }, { status: 400 });
  }

  try {
    await sendEmail({
      to: body.to,
      subject: "Test email from AI Rental Office Assistant",
      html: `
        <div style="font-family: sans-serif; padding: 24px; color: #1C1815;">
          <h2 style="color: #B5562F;">It works!</h2>
          <p>This is a test email confirming Gmail SMTP sending is correctly
          configured for AI Rental Office Assistant.</p>
          <p style="color: #6B6358; font-size: 13px;">Sent at ${new Date().toISOString()}</p>
        </div>
      `,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Send failed: ${message}` }, { status: 500 });
  }
}
