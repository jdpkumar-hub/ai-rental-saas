"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/session";

type ConversationTurn = {
  role: "system" | "user" | "assistant";
  content: string;
  recording_url?: string;
};

type Call = {
  id: string;
  call_sid: string;
  from_number: string | null;
  to_number: string | null;
  status: string;
  conversation: ConversationTurn[];
  recording_url: string | null;
  full_call_recording_url: string | null;
  duration_seconds: number | null;
  summary: string | null;
  sentiment: string | null;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

export default function CallsClient({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCalls();
  }, []);

  async function fetchCalls() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calls");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load calls");
      } else {
        setCalls(data.calls ?? []);
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
          <a href="/dashboard/calls" style={{ ...styles.navLink, ...styles.navLinkActive }}>
            Calls
          </a>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Sign out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <h1 style={styles.h1}>Call History</h1>
        <p style={styles.subtitle}>
          Every call to <strong>{session.companyCode}</strong>'s number, with the AI's
          live transcript and the resulting lead, if one was captured.
        </p>

        {loading && <div style={styles.loading}>Loading calls…</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {!loading && !error && calls.length === 0 && (
          <div style={styles.empty}>
            No calls yet. Once your Twilio number receives a call, it'll show up here.
          </div>
        )}

        {!loading && !error && calls.length > 0 && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Duration</th>
                  <th style={styles.th}>Summary</th>
                  <th style={styles.th}>Sentiment</th>
                  <th style={styles.th}>When</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <CallRow
                    key={call.id}
                    call={call}
                    expanded={expandedId === call.id}
                    onToggle={() =>
                      setExpandedId(expandedId === call.id ? null : call.id)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function CallRow({
  call,
  expanded,
  onToggle,
}: {
  call: Call;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ ...styles.tr, ...(expanded ? styles.trExpanded : {}) }}
      >
        <td style={styles.td}>{call.lead_name || <Muted>Unknown</Muted>}</td>
        <td style={{ ...styles.td, ...styles.mono }}>
          {call.lead_phone || call.from_number || <Muted>—</Muted>}
        </td>
        <td style={styles.td}>
          <StatusBadge status={call.status} />
        </td>
        <td style={{ ...styles.td, ...styles.mono }}>
          {formatDuration(call.duration_seconds)}
        </td>
        <td style={styles.td}>
          <Muted>Coming in Phase 6</Muted>
        </td>
        <td style={styles.td}>
          <Muted>Coming in Phase 6</Muted>
        </td>
        <td style={{ ...styles.td, ...styles.mono }}>{formatWhen(call.created_at)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={styles.expandedCell}>
            <CallDetail call={call} />
          </td>
        </tr>
      )}
    </>
  );
}

function CallDetail({ call }: { call: Call }) {
  const transcriptTurns = call.conversation.filter((t) => t.role !== "system");

  return (
    <div style={styles.detailWrap}>
      {call.full_call_recording_url && (
        <div style={{ ...styles.detailSection, marginBottom: 20 }}>
          <div style={styles.detailLabel}>Full Call</div>
          <AudioPlayer callId={call.id} recordingUrl={call.full_call_recording_url} />
        </div>
      )}
      <div style={styles.detailSection}>
        <div style={styles.detailLabel}>Transcript</div>
        <div style={styles.transcriptBox}>
          {transcriptTurns.length === 0 ? (
            <Muted>No conversation recorded.</Muted>
          ) : (
            transcriptTurns.map((turn, i) => (
              <div key={i} style={styles.transcriptTurn}>
                <div style={styles.transcriptSpeaker}>
                  {turn.role === "assistant" ? "Assistant" : "Caller"}
                </div>
                <div style={styles.transcriptText}>{turn.content}</div>
                {turn.recording_url && (
                  <AudioPlayer callId={call.id} recordingUrl={turn.recording_url} />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AudioPlayer({ callId, recordingUrl }: { callId: string; recordingUrl: string }) {
  const proxiedUrl = `/api/calls/recording?callId=${encodeURIComponent(
    callId
  )}&url=${encodeURIComponent(recordingUrl)}`;

  return (
    <audio controls style={styles.audio} preload="none">
      <source src={proxiedUrl} />
      Your browser doesn't support audio playback.
    </audio>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    completed: { bg: "#E8F0E9", fg: "#4B6651" },
    in_progress: { bg: "#FBF1E2", fg: "#9A6B1F" },
    failed: { bg: "#FBEAE6", fg: "#A8392B" },
    abandoned: { bg: "#F2ECE1", fg: "#6B6358" },
  };
  const colors = colorMap[status] ?? colorMap.abandoned;

  return (
    <span
      style={{
        ...styles.badge,
        backgroundColor: colors.bg,
        color: colors.fg,
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--color-ink-muted)" }}>{children}</span>;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
    maxWidth: 1100,
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
    marginBottom: 28,
    maxWidth: 600,
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
  empty: {
    color: "var(--color-ink-muted)",
    fontSize: 14,
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    padding: 24,
  },
  tableWrap: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13.5,
  },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    borderBottom: "1px solid var(--color-border)",
    background: "#F7F2E9",
  },
  tr: {
    cursor: "pointer",
    borderBottom: "1px solid var(--color-border)",
  },
  trExpanded: {
    background: "#FBF8F3",
  },
  td: {
    padding: "12px 16px",
    color: "var(--color-ink)",
  },
  mono: {
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
  },
  badge: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 4,
    textTransform: "capitalize",
  },
  expandedCell: {
    padding: 0,
    background: "#FBF8F3",
    borderBottom: "1px solid var(--color-border)",
  },
  detailWrap: {
    padding: "20px 24px 24px",
  },
  detailSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  detailLabel: {
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  transcriptBox: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    maxHeight: 360,
    overflowY: "auto",
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: 16,
  },
  transcriptTurn: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  transcriptSpeaker: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-clay-dark)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  transcriptText: {
    fontSize: 13.5,
    color: "var(--color-ink)",
    lineHeight: 1.5,
  },
  audio: {
    marginTop: 4,
    height: 32,
    width: "100%",
    maxWidth: 360,
  },
};
