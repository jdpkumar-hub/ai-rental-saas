"use client";

import { useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/session";

type Settings = {
  greeting: string;
  voice: string;
  timezone: string;
  sms_enabled: boolean;
  email_enabled: boolean;
} | null;

type CallUsage = {
  used: number;
  overage: number;
  limit: number | null; // null = unlimited
  overagePriceCents: number;
};

export default function DashboardClient({
  session,
  settings,
  userCount,
  callUsage,
}: {
  session: SessionPayload;
  settings: Settings;
  userCount: number;
  callUsage: CallUsage;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/"); // After logout, go to the public landing page rather than straight back to the login form -- per your request, signing out should feel like leaving the app, not landing on another form to fill in.
    router.refresh();
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.mark}>R</div>
          <div>
            <div style={styles.companyLabel}>{session.companyCode}</div>
            <div style={styles.userLabel}>
              {session.name} · {session.role}
            </div>
          </div>
        </div>
        <div style={styles.headerNav}>
          <a href="/dashboard" style={{ ...styles.navLink, ...styles.navLinkActive }}>
            Dashboard
          </a>
          <a href="/dashboard/calls" style={styles.navLink}>
            Calls
          </a>
          <a href="/dashboard/leads" style={styles.navLink}>
            Leads
          </a>
          <a href="/dashboard/analytics" style={styles.navLink}>
            Analytics
          </a>
          <a href="/dashboard/insights" style={styles.navLink}>
            Insights
          </a>
          {(session.role === "admin" || session.role === "manager") && (
            <a href="/dashboard/users" style={styles.navLink}>
              Users
            </a>
          )}
          {(session.role === "admin" || session.role === "manager") && (
            <a href="/dashboard/settings" style={styles.navLink}>
              Settings
            </a>
          )}
          <button onClick={handleLogout} style={styles.logoutButton}>
            Sign out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <h1 style={styles.h1}>Dashboard</h1>
        <p style={styles.subtitle}>
          Phase 1 foundation — this view is scoped entirely to{" "}
          <strong>{session.companyCode}</strong>. Other companies cannot see
          this data, and you cannot see theirs.
        </p>

        <div style={styles.grid}>
          <CallUsageCard usage={callUsage} />

          <Card title="Company settings" mono>
            {settings ? (
              <>
                <Row label="Greeting" value={settings.greeting} />
                <Row label="Voice" value={settings.voice} />
                <Row label="Timezone" value={settings.timezone} />
                <Row
                  label="SMS"
                  value={settings.sms_enabled ? "enabled" : "disabled"}
                />
                <Row
                  label="Email"
                  value={settings.email_enabled ? "enabled" : "disabled"}
                />
              </>
            ) : (
              <div style={styles.empty}>No settings found.</div>
            )}
          </Card>

          <Card title="Team">
            <div style={styles.bigNumber}>{userCount}</div>
            <div style={styles.bigNumberLabel}>
              user{userCount === 1 ? "" : "s"} at this company
            </div>
          </Card>

          <Card title="Coming in later phases">
            <ul style={styles.upcomingList}>
              <li>Live calls &amp; recordings (Phase 2–3)</li>
              <li>Real-time call &amp; lead analytics (Phase 4)</li>
              <li>Leasing CRM (Phase 5)</li>
              <li>AI-generated insights (Phase 6)</li>
              <li>Billing, branding, multi-user roles (Phase 7)</li>
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CallUsageCard
//
// "63 of 100 calls used this month" with a progress bar. Transparency for
// the tenant: they can always see where they stand against their plan's
// included calls, and what an over-limit call costs, BEFORE any overage
// appears on an invoice. Unlimited plans just show the raw count.
// ----------------------------------------------------------------------------
function CallUsageCard({ usage }: { usage: CallUsage }) {
  const { used, overage, limit, overagePriceCents } = usage;
  const overagePrice = `$${(overagePriceCents / 100).toFixed(2)}`;

  if (limit === null) {
    return (
      <Card title="Calls this month">
        <div style={styles.bigNumber}>{used}</div>
        <div style={styles.bigNumberLabel}>
          call{used === 1 ? "" : "s"} answered this month · unlimited plan
        </div>
      </Card>
    );
  }

  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 100;
  const atOrOver = used >= limit;
  const remaining = Math.max(limit - used, 0);
  const barColor = atOrOver
    ? "#c0392b"
    : pct >= 80
      ? "#d68910"
      : "var(--color-clay)";

  return (
    <Card title="Calls this month">
      <div style={styles.bigNumber}>
        {used}
        <span style={styles.bigNumberOf}> / {limit}</span>
      </div>
      <div style={styles.bigNumberLabel}>included calls used this month</div>

      <div style={styles.usageBarTrack}>
        <div
          style={{
            ...styles.usageBarFill,
            width: `${pct}%`,
            background: barColor,
          }}
        />
      </div>

      <div style={styles.usageNote}>
        {atOrOver
          ? `Limit reached — calls are still answered, and each additional call this month is billed at ${overagePrice} on your next invoice.` +
            (overage > 0 ? ` Over-limit calls so far: ${overage}.` : "")
          : `${remaining} call${remaining === 1 ? "" : "s"} remaining. Calls beyond your plan's ${limit} are still answered and billed at ${overagePrice} each.`}
      </div>
    </Card>
  );
}

function Card({
  title,
  children,
  mono,
}: {
  title: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={mono ? styles.cardBodyMono : styles.cardBody}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--color-bg)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 32px",
    borderBottom: "1px solid var(--color-border)",
    background: "var(--color-surface)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  headerNav: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  navLink: {
    fontSize: 13.5,
    color: "var(--color-ink-muted)",
    textDecoration: "none",
    paddingBottom: 4,
    borderBottom: "2px solid transparent",
  },
  navLinkActive: {
    color: "var(--color-ink)",
    fontWeight: 600,
    borderBottom: "2px solid var(--color-clay)",
  },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 7,
    background: "var(--color-clay)",
    color: "white",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  companyLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-ink)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  userLabel: {
    fontSize: 12.5,
    color: "var(--color-ink-muted)",
  },
  logoutButton: {
    background: "transparent",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: "8px 14px",
    fontSize: 13.5,
    color: "var(--color-ink)",
    cursor: "pointer",
  },
  main: {
    maxWidth: 1040,
    margin: "0 auto",
    padding: "40px 32px 64px",
  },
  h1: {
    fontFamily: "var(--font-display)",
    fontSize: 28,
    fontWeight: 600,
    margin: 0,
  },
  subtitle: {
    color: "var(--color-ink-muted)",
    fontSize: 14.5,
    marginTop: 8,
    marginBottom: 32,
    maxWidth: 560,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 20,
  },
  card: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    padding: 20,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 14,
  },
  cardBody: {},
  cardBodyMono: {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    borderBottom: "1px solid var(--color-border)",
  },
  rowLabel: {
    color: "var(--color-ink-muted)",
  },
  rowValue: {
    color: "var(--color-ink)",
    textAlign: "right",
    maxWidth: "60%",
  },
  empty: {
    color: "var(--color-ink-muted)",
    fontSize: 13.5,
  },
  bigNumber: {
    fontFamily: "var(--font-display)",
    fontSize: 40,
    fontWeight: 700,
    color: "var(--color-clay)",
    lineHeight: 1,
  },
  bigNumberOf: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
  },
  bigNumberLabel: {
    fontSize: 13,
    color: "var(--color-ink-muted)",
    marginTop: 4,
  },
  usageBarTrack: {
    height: 8,
    borderRadius: 4,
    background: "var(--color-border)",
    marginTop: 14,
    overflow: "hidden",
  },
  usageBarFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.3s ease",
  },
  usageNote: {
    fontSize: 12.5,
    color: "var(--color-ink-muted)",
    marginTop: 10,
    lineHeight: 1.5,
  },
  upcomingList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13.5,
    color: "var(--color-ink-muted)",
    lineHeight: 1.8,
  },
};
