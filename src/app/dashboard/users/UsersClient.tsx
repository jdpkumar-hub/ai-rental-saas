"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/session";

type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "agent";
  active: boolean;
  created_at: string;
};

const ROLE_OPTIONS = ["admin", "manager", "agent"] as const;

export default function UsersClient({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users?full=1");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load users");
      } else {
        setUsers(json.users ?? []);
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
          <a href="/dashboard/insights" style={styles.navLink}>
            Insights
          </a>
          <a href="/dashboard/users" style={{ ...styles.navLink, ...styles.navLinkActive }}>
            Users
          </a>
          <a href="/dashboard/settings" style={styles.navLink}>
            Settings
          </a>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Sign out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.titleRow}>
          <div>
            <h1 style={styles.h1}>Team</h1>
            <p style={styles.subtitle}>
              Everyone with access to <strong>{session.companyCode}</strong>'s dashboard.
              Admins and managers can add teammates and manage access.
            </p>
          </div>
          <button onClick={() => setShowAddForm(true)} style={styles.addButton}>
            + Add teammate
          </button>
        </div>

        {showAddForm && (
          <AddUserForm
            onClose={() => setShowAddForm(false)}
            onCreated={(newUser) => {
              setUsers((prev) => [...prev, newUser]);
              setShowAddForm(false);
            }}
          />
        )}

        {loading && <div style={styles.loading}>Loading team…</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {!loading && !error && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Joined</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === session.userId}
                    onUpdated={(updated) =>
                      setUsers((prev) =>
                        prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
                      )
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

function AddUserForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: User) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "agent">("agent");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add teammate.");
        setSubmitting(false);
        return;
      }
      onCreated(data.user);
    } catch {
      setError("Could not reach the server.");
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.addFormCard}>
      <form onSubmit={handleSubmit} style={styles.addFormGrid}>
        <div style={styles.formField}>
          <label style={styles.formLabel}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={styles.formInput}
            placeholder="Jane Smith"
          />
        </div>
        <div style={styles.formField}>
          <label style={styles.formLabel}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.formInput}
            placeholder="jane@company.com"
          />
        </div>
        <div style={styles.formField}>
          <label style={styles.formLabel}>Temporary Password</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={styles.formInput}
            placeholder="At least 8 characters"
          />
        </div>
        <div style={styles.formField}>
          <label style={styles.formLabel}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            style={styles.formInput}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {capitalize(r)}
              </option>
            ))}
          </select>
        </div>

        {error && <div style={styles.formError}>{error}</div>}

        <div style={styles.formActions}>
          <button type="submit" disabled={submitting} style={styles.formSubmit}>
            {submitting ? "Adding…" : "Add teammate"}
          </button>
          <button type="button" onClick={onClose} style={styles.formCancel}>
            Cancel
          </button>
        </div>
      </form>
      <p style={styles.formHint}>
        Share their email and this temporary password with them directly — there's no
        automated invite email yet, so they'll need it from you.
      </p>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onUpdated,
}: {
  user: User;
  isSelf: boolean;
  onUpdated: (user: Partial<User> & { id: string }) => void;
}) {
  const [resettingPassword, setResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  async function patchUser(updates: Record<string, unknown>) {
    setActionError(null);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Update failed.");
        return;
      }
      onUpdated(data.user);
    } catch {
      setActionError("Could not reach the server.");
    }
  }

  async function handleResetPassword() {
    if (newPassword.length < 8) {
      setActionError("Password must be at least 8 characters.");
      return;
    }
    await patchUser({ password: newPassword });
    setResettingPassword(false);
    setNewPassword("");
  }

  return (
    <>
      <tr style={styles.tr}>
        <td style={styles.td}>
          {user.name} {isSelf && <span style={styles.youBadge}>you</span>}
        </td>
        <td style={{ ...styles.td, ...styles.mono }}>{user.email}</td>
        <td style={styles.td}>
          <select
            value={user.role}
            onChange={(e) => patchUser({ role: e.target.value })}
            disabled={isSelf}
            style={styles.roleSelect}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {capitalize(r)}
              </option>
            ))}
          </select>
        </td>
        <td style={styles.td}>
          <StatusBadge active={user.active} />
        </td>
        <td style={{ ...styles.td, ...styles.mono }}>{formatDate(user.created_at)}</td>
        <td style={{ ...styles.td, ...styles.actionsCell }}>
          {!isSelf && (
            <button
              onClick={() => patchUser({ active: !user.active })}
              style={user.active ? styles.deactivateButton : styles.activateButton}
            >
              {user.active ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <button
            onClick={() => setResettingPassword(!resettingPassword)}
            style={styles.resetButton}
          >
            Reset password
          </button>
        </td>
      </tr>
      {resettingPassword && (
        <tr>
          <td colSpan={6} style={styles.resetRow}>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New temporary password (8+ characters)"
              style={styles.formInput}
            />
            <button onClick={handleResetPassword} style={styles.formSubmit}>
              Set password
            </button>
            <button
              onClick={() => {
                setResettingPassword(false);
                setNewPassword("");
              }}
              style={styles.formCancel}
            >
              Cancel
            </button>
          </td>
        </tr>
      )}
      {actionError && (
        <tr>
          <td colSpan={6} style={styles.actionErrorRow}>
            {actionError}
          </td>
        </tr>
      )}
    </>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        ...styles.badge,
        backgroundColor: active ? "#E8F0E9" : "#F2ECE1",
        color: active ? "#4B6651" : "#6B6358",
      }}
    >
      {active ? "Active" : "Deactivated"}
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  headerNav: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" },
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
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 12,
  },
  h1: { fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, margin: 0 },
  subtitle: { color: "var(--color-ink-muted)", fontSize: 14.5, marginTop: 8, maxWidth: 560 },
  addButton: {
    background: "var(--color-clay)",
    color: "white",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "10px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
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
  addFormCard: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    padding: 20,
    marginBottom: 24,
  },
  addFormGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    alignItems: "end",
  },
  formField: { display: "flex", flexDirection: "column", gap: 6 },
  formLabel: {
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  formInput: {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: "9px 11px",
    fontSize: 13.5,
    background: "var(--color-bg)",
    color: "var(--color-ink)",
    fontFamily: "var(--font-body)",
  },
  formError: {
    gridColumn: "1 / -1",
    background: "#FBEAE6",
    color: "var(--color-danger)",
    border: "1px solid #EFC9C0",
    borderRadius: "var(--radius)",
    padding: "8px 12px",
    fontSize: 13,
  },
  formActions: { display: "flex", gap: 10, gridColumn: "1 / -1" },
  formSubmit: {
    background: "var(--color-clay)",
    color: "white",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "9px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  formCancel: {
    background: "transparent",
    border: "1px solid var(--color-border)",
    color: "var(--color-ink)",
    borderRadius: "var(--radius)",
    padding: "9px 16px",
    fontSize: 13.5,
    cursor: "pointer",
  },
  formHint: {
    fontSize: 12,
    color: "var(--color-ink-muted)",
    marginTop: 14,
    lineHeight: 1.6,
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
  tr: { borderBottom: "1px solid var(--color-border)" },
  td: { padding: "12px 16px", color: "var(--color-ink)" },
  mono: { fontFamily: "var(--font-mono)", fontSize: 12.5 },
  youBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--color-ink-muted)",
    marginLeft: 6,
  },
  roleSelect: {
    border: "1px solid var(--color-border)",
    borderRadius: 4,
    padding: "5px 8px",
    fontSize: 12.5,
    background: "var(--color-surface)",
    color: "var(--color-ink)",
  },
  badge: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 4,
  },
  actionsCell: { display: "flex", gap: 8, justifyContent: "flex-end" },
  deactivateButton: {
    background: "transparent",
    border: "1px solid var(--color-danger)",
    color: "var(--color-danger)",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  activateButton: {
    background: "transparent",
    border: "1px solid var(--color-moss)",
    color: "var(--color-moss)",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  resetButton: {
    background: "transparent",
    border: "1px solid var(--color-border)",
    color: "var(--color-ink)",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  resetRow: {
    padding: "12px 16px",
    background: "#FBF8F3",
    display: "flex",
    gap: 10,
    borderBottom: "1px solid var(--color-border)",
  },
  actionErrorRow: {
    padding: "8px 16px",
    background: "#FBEAE6",
    color: "var(--color-danger)",
    fontSize: 12.5,
  },
};
