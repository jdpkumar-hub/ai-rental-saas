import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getTrialStatus } from "@/lib/trialStatus";

// ----------------------------------------------------------------------------
// /trial-expired
//
// Where a logged-in user gets redirected if their company's trial has
// run out (see src/app/dashboard/layout.tsx for the actual enforcement
// check). Deliberately NOT behind the dashboard's nav/header — someone
// here has no working dashboard to navigate to, so this is a focused,
// single-purpose page: explain what happened, tell them who to contact.
//
// If somehow a non-expired (or non-trial) user lands here directly,
// send them back to their working dashboard rather than showing a
// confusing "your trial expired" message that doesn't apply to them.
// ----------------------------------------------------------------------------
export default async function TrialExpiredPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const trial = await getTrialStatus(session.companyId);

  if (!trial.isExpired) {
    redirect("/dashboard");
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.mark}>R</div>
        <h1 style={styles.h1}>Your free trial has ended</h1>
        <p style={styles.body}>
          <strong>{session.companyCode}</strong>'s 14-day trial ended on{" "}
          {trial.trialEndsAt &&
            new Date(trial.trialEndsAt).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          . Your calls, leads, and dashboard data are all still safely stored —
          nothing has been deleted.
        </p>
        <p style={styles.body}>
          To keep using your AI Rental Office Assistant, reach out and we'll get
          your account switched over to a paid plan right away.
        </p>
        <a href="mailto:hello@yourdomain.com" style={styles.button}>
          Contact us to continue
        </a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-bg)",
    padding: 24,
  },
  card: {
    maxWidth: 480,
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    boxShadow: "var(--shadow-card)",
    padding: "40px 36px",
    textAlign: "center",
  },
  mark: {
    width: 44,
    height: 44,
    margin: "0 auto 20px",
    borderRadius: 10,
    background: "var(--color-clay)",
    color: "white",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  h1: {
    fontFamily: "var(--font-display)",
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 16px",
  },
  body: {
    fontSize: 14.5,
    color: "var(--color-ink-muted)",
    lineHeight: 1.6,
    marginBottom: 16,
  },
  button: {
    display: "inline-block",
    marginTop: 8,
    background: "var(--color-clay)",
    color: "white",
    borderRadius: "var(--radius)",
    padding: "12px 24px",
    fontSize: 14.5,
    fontWeight: 600,
    textDecoration: "none",
  },
};
