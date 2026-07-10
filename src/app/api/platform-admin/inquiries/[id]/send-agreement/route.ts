import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

// ----------------------------------------------------------------------------
// POST /api/platform-admin/inquiries/[id]/send-agreement
//
// Onboarding step 2 (inquiry -> AGREEMENT -> provision -> welcome email):
// one click emails the prospect a personalized next-steps + agreement
// email and moves the inquiry to status 'agreement_sent'. Re-clicking
// sends a fresh copy (useful for "never got it" follow-ups).
//
// If the AGREEMENT_URL env var is set (a hosted PDF / signing link), the
// email includes a "review and sign" link; otherwise it says the
// agreement will follow separately, so this works before you've hosted
// the document anywhere.
// ----------------------------------------------------------------------------
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data: inquiry, error } = await supabaseAdmin
    .from("inquiries")
    .select("id, contact_name, company_name, email")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !inquiry) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }

  const agreementUrl = process.env.AGREEMENT_URL || null;
  const firstName = (inquiry.contact_name || "").split(" ")[0] || "there";

  await sendEmail({
    to: inquiry.email,
    subject: `Next steps for ${inquiry.company_name} — AI Rental Office Assistant`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Great speaking with you about putting an AI assistant on
      <strong>${inquiry.company_name}</strong>'s leasing line. Here's how
      onboarding works:</p>
      <ol>
        <li><strong>Service agreement.</strong> ${
          agreementUrl
            ? `Review and sign it here: <a href="${agreementUrl}">${agreementUrl}</a>`
            : "We'll send it over in a separate email for you to review and sign."
        }</li>
        <li><strong>We set everything up.</strong> Once signed, we provision
        your dedicated phone number, configure the assistant with your
        greeting and property details, and create your dashboard logins.</li>
        <li><strong>14-day trial starts.</strong> You'll get your login by
        email and can watch calls, transcripts, and leads arrive in real
        time. No payment is collected until the trial ends — the one-time
        setup fee is bundled with your first subscription payment.</li>
      </ol>
      <p>Reply to this email with any questions, or just to tell us you're
      ready to go.</p>
      <p>— AI Rental Office Assistant</p>
    `,
  });

  await supabaseAdmin
    .from("inquiries")
    .update({ status: "agreement_sent" })
    .eq("id", inquiry.id);

  return NextResponse.json({ success: true });
}
