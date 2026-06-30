import nodemailer from "nodemailer";

// ----------------------------------------------------------------------------
// Email sending via Gmail SMTP, using an app password (not OAuth2).
// An app password is the same underlying Gmail SMTP server,
// authenticated simply, and is sufficient for this app's volume (trial
// reminders, not marketing blasts).
//
// GMAIL_USER / GMAIL_APP_PASSWORD are read from environment variables —
// never hardcoded — and this module throws clearly if they're missing,
// rather than failing silently or with a cryptic SMTP auth error deep
// inside nodemailer.
// ----------------------------------------------------------------------------

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER and GMAIL_APP_PASSWORD must both be set to send email."
    );
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // false for port 587 (STARTTLS)
    auth: { user, pass },
  });
}

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

// ----------------------------------------------------------------------------
// sendEmail
//
// Thin wrapper around nodemailer.sendMail. Deliberately does NOT swallow
// errors silently — every call site (trial reminders, webhook
// confirmations) needs to know whether a send actually succeeded, since
// "the email silently never arrived" is exactly the kind of failure
// that's easy to miss until a customer says "I never got a reminder."
// Callers should wrap this in their own try/catch and log/handle
// failures appropriately for their context.
// ----------------------------------------------------------------------------
export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  const transporter = getTransporter();
  const fromAddress = process.env.GMAIL_USER;

  return transporter.sendMail({
    from: `"AI Rental Office Assistant" <${fromAddress}>`,
    to,
    subject,
    html,
    text: text ?? stripHtml(html),
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
