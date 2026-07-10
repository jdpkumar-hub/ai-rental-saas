// ----------------------------------------------------------------------------
// src/lib/sms.ts
//
// Outbound SMS via Twilio's REST API — plain fetch, no SDK, same pattern
// as src/lib/openai.ts. Used for tenant lead alerts (recording-complete);
// reusable for any future SMS feature (usage warnings, digests).
//
// COMPLIANCE NOTE (US): application-to-person SMS from local numbers
// requires A2P 10DLC registration on the Twilio account (Twilio Console
// -> Messaging -> Regulatory compliance). Unregistered traffic gets
// carrier-filtered — messages silently fail or error 30034. Register the
// brand + a "customer notifications" campaign before relying on this in
// production.
// ----------------------------------------------------------------------------

export async function sendSms({
  to,
  from,
  body,
}: {
  to: string;
  from: string;
  body: string;
}): Promise<{ sid: string } | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error("[sms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("[sms] Twilio send failed:", data?.message ?? res.status);
      return null;
    }

    return { sid: data.sid as string };
  } catch (err) {
    console.error("[sms] Twilio send error:", err);
    return null;
  }
}
