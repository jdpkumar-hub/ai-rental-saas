"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/session";

type Lead = {
  id: string;
  call_id: string | null;
  name: string | null;
  phone: string | null;
  budget: string | null;
  move_in_date: string | null;
  apartment_size: string | null;
  status: string;
  notes: string | null;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  tour_scheduled_at: string | null;
  follow_up_date: string | null;
  lease_probability: "low" | "medium" | "high" | null;
  lease_probability_score: number | null;
  lease_probability_reasons: string[] | null;
  created_at: string;
  updated_at: string;
};

type Agent = { id: string; name: string; role: string };

const STATUS_OPTIONS = ["new", "contacted", "toured", "applied", "leased", "lost"];

export default function LeadsClient({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [leadsRes, agentsRes] = await Promise.all([
        fetch("/api/leads"),
        fetch("/api/users"),
      ]);
      const leadsJson = await leadsRes.json();
      const agentsJson = await agentsRes.json();

      if (!leadsRes.ok) {
        setError(leadsJson.error || "Failed to load leads");
      } else {
        setLeads(leadsJson.leads ?? []);
      }
      if (agentsRes.ok) {
        setAgents(agentsJson.users ?? []);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function updateLead(id: string, updates: Record<string, unknown>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));

    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.ok && data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...data.lead } : l)));
      } else {
        fetchData();
      }
    } catch {
      fetchData();
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const filteredLeads =
    statusFilter === "all" ? leads : leads.filter((l) => l.status === statusFilter);

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
          <a href="/dashboard/leads" style={{ ...styles.navLink, ...styles.navLinkActive }}>
            Leads
          </a>
          <a href="/dashboard/analytics" style={styles.navLink}>
            Analytics
          </a>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Sign out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.titleRow}>
          <div>
            <h1 style={styles.h1}>Leads</h1>
            <p style={styles.subtitle}>
              Every lead captured for <strong>{session.companyCode}</strong>. Click a row to
              update status, notes, tour date, and assignment.
            </p>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {capitalize(s)}
              </option>
            ))}
          </select>
        </div>

        {loading && <div style={styles.loading}>Loading leads…</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {!loading && !error && filteredLeads.length === 0 && (
          <div style={styles.empty}>No leads match this filter yet.</div>
        )}

        {!loading && !error && filteredLeads.length > 0 && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Customer</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Lease Probability</th>
                  <th style={styles.th}>Assigned Agent</th>
                  <th style={styles.th}>Tour</th>
                  <th style={styles.th}>Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    agents={agents}
                    expanded={expandedId === lead.id}
                    onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                    onUpdate={(updates) => updateLead(lead.id, updates)}
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

function LeadRow({
  lead,
  agents,
  expanded,
  onToggle,
  onUpdate,
}: {
  lead: Lead;
  agents: Agent[];
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Record<string, unknown>) => void;
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ ...styles.tr, ...(expanded ? styles.trExpanded : {}) }}>
        <td style={styles.td}>{lead.name || <Muted>Unknown</Muted>}</td>
        <td style={{ ...styles.td, ...styles.mono }}>{lead.phone || <Muted>—</Muted>}</td>
        <td style={styles.td}>
          <StatusBadge status={lead.status} />
        </td>
        <td style={styles.td}>
          <ProbabilityBadge
            probability={lead.lease_probability}
            score={lead.lease_probability_score}
          />
        </td>
        <td style={styles.td}>{lead.assigned_agent_name || <Muted>Unassigned</Muted>}</td>
        <td style={{ ...styles.td, ...styles.mono }}>
          {lead.tour_scheduled_at ? formatDateTime(lead.tour_scheduled_at) : <Muted>—</Muted>}
        </td>
        <td style={{ ...styles.td, ...styles.mono }}>
          {lead.follow_up_date ? formatDate(lead.follow_up_date) : <Muted>—</Muted>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={styles.expandedCell}>
            <LeadDetail lead={lead} agents={agents} onUpdate={onUpdate} />
          </td>
        </tr>
      )}
    </>
  );
}

function LeadDetail({
  lead,
  agents,
  onUpdate,
}: {
  lead: Lead;
  agents: Agent[];
  onUpdate: (updates: Record<string, unknown>) => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [notesSaved, setNotesSaved] = useState(true);

  function handleNotesBlur() {
    if (notes !== (lead.notes ?? "")) {
      onUpdate({ notes });
      setNotesSaved(true);
    }
  }

  return (
    <div style={styles.detailWrap}>
      <div style={styles.detailGrid}>
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Status</label>
          <select
            value={lead.status}
            onChange={(e) => onUpdate({ status: e.target.value })}
            style={styles.input}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {capitalize(s)}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Assigned Agent</label>
          <select
            value={lead.assigned_agent_id ?? ""}
            onChange={(e) => onUpdate({ assigned_agent_id: e.target.value || null })}
            style={styles.input}
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.role})
              </option>
            ))}
          </select>
        </div>

        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Tour Date &amp; Time</label>
          <input
            type="datetime-local"
            value={toDatetimeLocalValue(lead.tour_scheduled_at)}
            onChange={(e) =>
              onUpdate({
                tour_scheduled_at: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            style={styles.input}
          />
        </div>

        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Follow-up Date</label>
          <input
            type="date"
            value={lead.follow_up_date ?? ""}
            onChange={(e) => onUpdate({ follow_up_date: e.target.value || null })}
            style={styles.input}
          />
        </div>
      </div>

      <div style={styles.detailField}>
        <label style={styles.detailLabel}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesSaved(false);
          }}
          onBlur={handleNotesBlur}
          placeholder="Add notes about this lead…"
          style={styles.textarea}
          rows={3}
        />
        {!notesSaved && <span style={styles.unsavedHint}>Click away to save…</span>}
      </div>

      <div style={styles.detailField}>
        <label style={styles.detailLabel}>Lead details captured from call</label>
        <div style={styles.capturedGrid}>
          <CapturedField label="Budget" value={lead.budget} />
          <CapturedField label="Move-in" value={lead.move_in_date} />
          <CapturedField label="Apartment size" value={lead.apartment_size} />
        </div>
      </div>

      {lead.lease_probability_reasons && lead.lease_probability_reasons.length > 0 && (
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>
            Why this lead scored {lead.lease_probability} ({lead.lease_probability_score} pts)
          </label>
          <ul style={styles.reasonsList}>
            {lead.lease_probability_reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CapturedField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={styles.capturedLabel}>{label}</div>
      <div style={styles.capturedValue}>{value || <Muted>—</Muted>}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    new: { bg: "#F2ECE1", fg: "#6B6358" },
    contacted: { bg: "#FBF1E2", fg: "#9A6B1F" },
    toured: { bg: "#E5EEF5", fg: "#3D6485" },
    applied: { bg: "#EDE6F5", fg: "#6B4D8F" },
    leased: { bg: "#E8F0E9", fg: "#4B6651" },
    lost: { bg: "#FBEAE6", fg: "#A8392B" },
  };
  const colors = colorMap[status] ?? colorMap.new;
  return (
    <span style={{ ...styles.badge, backgroundColor: colors.bg, color: colors.fg }}>
      {capitalize(status)}
    </span>
  );
}

function ProbabilityBadge({
  probability,
  score,
}: {
  probability: "low" | "medium" | "high" | null;
  score: number | null;
}) {
  if (!probability) return <Muted>—</Muted>;
  const colorMap = {
    high: { bg: "#E8F0E9", fg: "#4B6651" },
    medium: { bg: "#FBF1E2", fg: "#9A6B1F" },
    low: { bg: "#F2ECE1", fg: "#6B6358" },
  };
  const colors = colorMap[probability];
  return (
    <span style={{ ...styles.badge, backgroundColor: colors.bg, color: colors.fg }}>
      {capitalize(probability)}
      {score !== null && <span style={styles.scoreHint}> · {score}</span>}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--color-ink-muted)" }}>{children}</span>;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
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
  headerNav: { display: "flex", alignItems: "center", gap: 20 },
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
  main: { maxWidth: 1180, margin: "0 auto", padding: "40px 32px 64px" },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
    flexWrap: "wrap",
    gap: 12,
  },
  h1: { fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, margin: 0 },
  subtitle: { color: "var(--color-ink-muted)", fontSize: 14.5, marginTop: 8, maxWidth: 560 },
  filterSelect: {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: "9px 12px",
    fontSize: 13.5,
    background: "var(--color-surface)",
    color: "var(--color-ink)",
  },
  loading: { color: "var(--color-ink-muted)", fontSize: 14 },
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
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
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
  tr: { cursor: "pointer", borderBottom: "1px solid var(--color-border)" },
  trExpanded: { background: "#FBF8F3" },
  td: { padding: "12px 16px", color: "var(--color-ink)" },
  mono: { fontFamily: "var(--font-mono)", fontSize: 12.5 },
  badge: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 4,
  },
  scoreHint: { opacity: 0.7, fontWeight: 400 },
  expandedCell: {
    padding: 0,
    background: "#FBF8F3",
    borderBottom: "1px solid var(--color-border)",
  },
  detailWrap: { padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 18 },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
  },
  detailField: { display: "flex", flexDirection: "column", gap: 6 },
  detailLabel: {
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  input: {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: "8px 10px",
    fontSize: 13.5,
    background: "var(--color-surface)",
    color: "var(--color-ink)",
    fontFamily: "var(--font-body)",
  },
  textarea: {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 13.5,
    background: "var(--color-surface)",
    color: "var(--color-ink)",
    fontFamily: "var(--font-body)",
    resize: "vertical",
  },
  unsavedHint: { fontSize: 11.5, color: "var(--color-ink-muted)", fontStyle: "italic" },
  capturedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 14,
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: 14,
  },
  capturedLabel: {
    fontSize: 10.5,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    marginBottom: 4,
  },
  capturedValue: { fontSize: 13.5, color: "var(--color-ink)" },
  reasonsList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--color-ink-muted)",
    lineHeight: 1.7,
  },
};
