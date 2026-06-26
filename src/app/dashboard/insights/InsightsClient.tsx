"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/session";

type LeadSummary = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  lease_probability: "low" | "medium" | "high" | null;
  follow_up_date: string | null;
  updated_at: string;
};

type Insights = {
  hotLeadsNeedingContact: LeadSummary[];
  staleLeads: LeadSummary[];
  missedCallsCount: number;
  completedWithoutLeadCount: number;
  topApartmentSize: { size: string; count: number } | null;
  conversionTrend: { thisWeek: number | null; lastWeek: number | null };
  staleDaysThreshold: number;
};

export default function InsightsClient({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInsights();
  }, []);

  async function fetchInsights() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load insights");
      } else {
        setData(json);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
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
          <a href="/dashboard" style={styles.navLink}>
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
          <a
            href="/dashboard/insights"
            style={{ ...styles.navLink, ...styles.navLinkActive }}
          >
            Insights
          </a>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Sign out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <h1 style={styles.h1}>AI Insights</h1>
        <p style={styles.subtitle}>
          Plain-language callouts computed from <strong>{session.companyCode}</strong>'s
          calls and leads — what needs attention right now, not just charts to read.
        </p>

        {loading && <div style={styles.loading}>Loading insights…</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {data && (
          <div style={styles.cardGrid}>
            <InsightCard
              tone={data.hotLeadsNeedingContact.length > 0 ? "urgent" : "good"}
              title="Hot leads needing contact"
            >
              {data.hotLeadsNeedingContact.length === 0 ? (
                <p style={styles.cardBody}>
                  No high-probability leads are sitting untouched right now — nice.
                </p>
              ) : (
                <>
                  <p style={styles.cardBody}>
                    <strong>{data.hotLeadsNeedingContact.length}</strong> lead
                    {data.hotLeadsNeedingContact.length === 1 ? "" : "s"} scored High and
                    {data.hotLeadsNeedingContact.length === 1 ? " hasn't" : " haven't"} been
                    contacted yet:
                  </p>
                  <ul style={styles.leadList}>
                    {data.hotLeadsNeedingContact.slice(0, 5).map((l) => (
                      <li key={l.id}>
                        <a href="/dashboard/leads" style={styles.leadLink}>
                          {l.name || "Unknown"}
                        </a>{" "}
                        {l.phone && <span style={styles.mono}>· {l.phone}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </InsightCard>

            <InsightCard
              tone={data.staleLeads.length > 0 ? "warn" : "good"}
              title={`Leads going cold (${data.staleDaysThreshold}+ days, no follow-up)`}
            >
              {data.staleLeads.length === 0 ? (
                <p style={styles.cardBody}>
                  Every open lead has a recent touch or an upcoming follow-up scheduled.
                </p>
              ) : (
                <>
                  <p style={styles.cardBody}>
                    <strong>{data.staleLeads.length}</strong> lead
                    {data.staleLeads.length === 1 ? "" : "s"} haven't been touched in{" "}
                    {data.staleDaysThreshold}+ days and have no follow-up scheduled:
                  </p>
                  <ul style={styles.leadList}>
                    {data.staleLeads.slice(0, 5).map((l) => (
                      <li key={l.id}>
                        <a href="/dashboard/leads" style={styles.leadLink}>
                          {l.name || "Unknown"}
                        </a>{" "}
                        <span style={styles.mono}>
                          · last touched {formatRelativeDate(l.updated_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </InsightCard>

            <InsightCard
              tone={
                data.missedCallsCount + data.completedWithoutLeadCount > 0
                  ? "warn"
                  : "good"
              }
              title="Missed opportunities"
            >
              {data.missedCallsCount === 0 && data.completedWithoutLeadCount === 0 ? (
                <p style={styles.cardBody}>
                  Every call either completed cleanly or produced a lead — nothing
                  fell through.
                </p>
              ) : (
                <ul style={styles.plainList}>
                  {data.missedCallsCount > 0 && (
                    <li>
                      <strong>{data.missedCallsCount}</strong> call
                      {data.missedCallsCount === 1 ? "" : "s"} failed or were abandoned
                      before connecting properly.
                    </li>
                  )}
                  {data.completedWithoutLeadCount > 0 && (
                    <li>
                      <strong>{data.completedWithoutLeadCount}</strong> call
                      {data.completedWithoutLeadCount === 1 ? "" : "s"} completed but the
                      caller hung up before enough details were captured to form a lead.
                    </li>
                  )}
                </ul>
              )}
            </InsightCard>

            <InsightCard tone="neutral" title="Conversion trend">
              <ConversionInsight trend={data.conversionTrend} />
            </InsightCard>

            <InsightCard tone="neutral" title="Most requested apartment size">
              {data.topApartmentSize ? (
                <p style={styles.cardBody}>
                  <strong>{data.topApartmentSize.size}</strong> is the most requested size
                  across all captured leads, with{" "}
                  <strong>{data.topApartmentSize.count}</strong> request
                  {data.topApartmentSize.count === 1 ? "" : "s"}. Worth checking whether
                  your current vacancies match this demand.
                </p>
              ) : (
                <p style={styles.cardBody}>Not enough leads yet to identify a pattern.</p>
              )}
            </InsightCard>
          </div>
        )}
      </main>
    </div>
  );
}

function ConversionInsight({
  trend,
}: {
  trend: { thisWeek: number | null; lastWeek: number | null };
}) {
  if (trend.thisWeek === null) {
    return <p style={styles.cardBody}>No calls yet this week to compare.</p>;
  }
  if (trend.lastWeek === null) {
    return (
      <p style={styles.cardBody}>
        This week's conversion rate is <strong>{trend.thisWeek}%</strong>. No data from
        last week yet to compare against.
      </p>
    );
  }

  const diff = trend.thisWeek - trend.lastWeek;
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";

  return (
    <p style={styles.cardBody}>
      Conversion rate is <strong>{trend.thisWeek}%</strong> this week, {direction}{" "}
      {diff !== 0 && (
        <>
          <strong>
            {Math.abs(diff)} point{Math.abs(diff) === 1 ? "" : "s"}
          </strong>{" "}
        </>
      )}
      from <strong>{trend.lastWeek}%</strong> last week.
    </p>
  );
}

function InsightCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "urgent" | "warn" | "good" | "neutral";
  children: React.ReactNode;
}) {
  const toneColors = {
    urgent: { border: "var(--color-clay)", bg: "#FBF1EC" },
    warn: { border: "#C99A4A", bg: "#FBF6E9" },
    good: { border: "var(--color-moss)", bg: "#F1F6F1" },
    neutral: { border: "var(--color-border)", bg: "var(--color-surface)" },
  }[tone];

  return (
    <div
      style={{
        ...styles.card,
        borderLeftColor: toneColors.border,
        background: toneColors.bg,
      }}
    >
      <div style={styles.cardTitle}>{title}</div>
      {children}
    </div>
  );
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "var(--color-bg)" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 32px",
    borderBottom: "1px solid var(--color-border)",
    background: "var(--color-surface)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  headerNav: { display: "flex", alignItems: "center", gap: 18 },
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
  userLabel: { fontSize: 12.5, color: "var(--color-ink-muted)" },
  logoutButton: {
    background: "transparent",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: "8px 14px",
    fontSize: 13.5,
    color: "var(--color-ink)",
    cursor: "pointer",
  },
  main: { maxWidth: 1100, margin: "0 auto", padding: "40px 32px 64px" },
  h1: { fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, margin: 0 },
  subtitle: { color: "var(--color-ink-muted)", fontSize: 14.5, marginTop: 8, maxWidth: 600 },
  loading: { color: "var(--color-ink-muted)", fontSize: 14, marginTop: 24 },
  errorBox: {
    background: "#FBEAE6",
    color: "var(--color-danger)",
    border: "1px solid #EFC9C0",
    borderRadius: "var(--radius)",
    padding: "12px 14px",
    fontSize: 13.5,
    marginTop: 24,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 18,
    marginTop: 28,
  },
  card: {
    border: "1px solid var(--color-border)",
    borderLeftWidth: 4,
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    padding: "18px 20px",
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--color-ink)",
    marginBottom: 10,
  },
  cardBody: {
    fontSize: 13.5,
    color: "var(--color-ink)",
    lineHeight: 1.6,
    margin: 0,
  },
  leadList: {
    margin: "10px 0 0",
    paddingLeft: 18,
    fontSize: 13.5,
    color: "var(--color-ink)",
    lineHeight: 1.8,
  },
  plainList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13.5,
    color: "var(--color-ink)",
    lineHeight: 1.8,
  },
  leadLink: {
    color: "var(--color-clay-dark)",
    fontWeight: 600,
    textDecoration: "none",
  },
  mono: { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-ink-muted)" },
};
