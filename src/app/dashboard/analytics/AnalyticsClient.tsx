"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { SessionPayload } from "@/lib/session";

type AnalyticsData = {
  today: {
    calls: number;
    newLeads: number;
    missedCalls: number;
    avgDurationSeconds: number;
    conversionRate: number;
  };
  trend: { date: string; calls: number; leads: number }[];
  peakHours: number[];
  apartmentSizeDemand: Record<string, number>;
  budgetDistribution: Record<string, number>;
  leadStatusBreakdown: Record<string, number>;
  totals: { allTimeCalls: number; allTimeLeads: number };
};

const REFRESH_INTERVAL_MS = 30_000;

export default function AnalyticsClient({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAnalytics = useCallback(async (isInitial: boolean) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load analytics");
      } else {
        setData(json);
        setLastUpdated(new Date());
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(true);
    const interval = setInterval(() => fetchAnalytics(false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

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
          <a
            href="/dashboard/analytics"
            style={{ ...styles.navLink, ...styles.navLinkActive }}
          >
            Analytics
          </a>
          <a href="/dashboard/insights" style={styles.navLink}>
            Insights
          </a>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Sign out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.titleRow}>
          <div>
            <h1 style={styles.h1}>Analytics</h1>
            <p style={styles.subtitle}>
              Live performance for <strong>{session.companyCode}</strong>, updating
              automatically every 30 seconds.
            </p>
          </div>
          {lastUpdated && (
            <div style={styles.lastUpdated}>
              Updated{" "}
              {lastUpdated.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          )}
        </div>

        {loading && <div style={styles.loading}>Loading analytics…</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {data && (
          <>
            <div style={styles.metricGrid}>
              <MetricCard label="Today's Calls" value={data.today.calls} />
              <MetricCard label="New Leads Today" value={data.today.newLeads} />
              <MetricCard
                label="Missed Calls Today"
                value={data.today.missedCalls}
                tone={data.today.missedCalls > 0 ? "warn" : "default"}
              />
              <MetricCard
                label="Avg Call Duration"
                value={formatDuration(data.today.avgDurationSeconds)}
              />
              <MetricCard
                label="Conversion Rate"
                value={`${data.today.conversionRate}%`}
                tone="accent"
              />
            </div>

            <ChartCard title="Calls & Leads — last 14 days">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={data.trend}
                  margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                    tickFormatter={(d: string) =>
                      new Date(d).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="calls"
                    name="Calls"
                    stroke="var(--color-clay)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="leads"
                    name="Leads"
                    stroke="var(--color-moss)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <div style={styles.chartRow}>
              <ChartCard title="Peak call times (hour of day)">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={data.peakHours.map((count, hour) => ({ hour, count }))}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10, fill: "var(--color-ink-muted)" }}
                      tickFormatter={(h: number) => `${h}:00`}
                      interval={3}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid var(--color-border)",
                      }}
                      labelFormatter={(h: number) => `${h}:00–${h + 1}:00`}
                    />
                    <Bar
                      dataKey="count"
                      name="Calls"
                      fill="var(--color-clay)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Most requested apartment sizes">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={Object.entries(data.apartmentSizeDemand).map(
                      ([size, count]) => ({ size, count })
                    )}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="size"
                      tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid var(--color-border)",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Leads"
                      fill="var(--color-moss)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div style={styles.chartRow}>
              <ChartCard title="Budget distribution">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={Object.entries(data.budgetDistribution).map(
                      ([range, count]) => ({ range, count })
                    )}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 9.5, fill: "var(--color-ink-muted)" }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid var(--color-border)",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Leads"
                      fill="var(--color-clay)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Lead status breakdown (all time)">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={Object.entries(data.leadStatusBreakdown).map(
                      ([status, count]) => ({ status, count })
                    )}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="status"
                      tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid var(--color-border)",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Leads"
                      fill="var(--color-moss)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <p style={styles.footnote}>
              All-time totals: {data.totals.allTimeCalls} calls, {data.totals.allTimeLeads}{" "}
              leads captured. "Tours Scheduled" and lease conversion aren't shown yet —
              they'll appear once leads can be marked as toured/leased from the CRM
              (coming in Phase 5).
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "warn";
}) {
  const valueColor =
    tone === "accent"
      ? "var(--color-clay)"
      : tone === "warn"
      ? "var(--color-danger)"
      : "var(--color-ink)";

  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color: valueColor }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.chartCard}>
      <div style={styles.chartTitle}>{title}</div>
      {children}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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
    maxWidth: 1180,
    margin: "0 auto",
    padding: "40px 32px 64px",
  },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
    flexWrap: "wrap",
    gap: 12,
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
    maxWidth: 560,
  },
  lastUpdated: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--color-ink-muted)",
    whiteSpace: "nowrap",
    marginTop: 4,
  },
  loading: {
    color: "var(--color-ink-muted)",
    fontSize: 14,
  },
  errorBox: {
    background: "#FBEAE6",
    color: "var(--color-danger)",
    border: "1px solid #EFC9C0",
    borderRadius: "var(--radius)",
    padding: "12px 14px",
    fontSize: 13.5,
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 16,
    marginBottom: 28,
  },
  metricCard: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    padding: "18px 20px",
  },
  metricLabel: {
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    marginBottom: 10,
  },
  metricValue: {
    fontFamily: "var(--font-display)",
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1,
  },
  chartRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginBottom: 20,
  },
  chartCard: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    padding: "18px 20px 8px",
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-ink)",
    marginBottom: 12,
  },
  footnote: {
    fontSize: 12.5,
    color: "var(--color-ink-muted)",
    marginTop: 8,
    maxWidth: 720,
    lineHeight: 1.6,
  },
};
