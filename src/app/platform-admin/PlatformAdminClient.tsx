"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformAdminSessionPayload } from "@/lib/platformAdminSession";

type TwilioNumber = {
  id: string;
  phone_number: string;
  label: string | null;
  active: boolean;
  created_at: string;
};

type Company = {
  id: string;
  company_name: string;
  company_code: string;
  email: string;
  phone: string | null;
  twilio_numbers: TwilioNumber[];
  subscription_plan: string;
  status: string;
  logo_url: string | null;
  brand_color: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
};

type Inquiry = {
  id: string;
  contact_name: string;
  company_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

type LandingPageVariant = {
  id: string;
  name: string;
  html_content: string;
  accent_color: string;
  is_live: boolean;
  created_at: string;
  updated_at: string;
};

type PricingPlan = {
  id: string;
  plan_key: string;
  name: string;
  tagline: string;
  description: string;
  setup_fee: number;
  monthly_fee: number;
  features: string[];
  is_featured: boolean;
  display_order: number;
  active: boolean;
};

type AdminAccount = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
};

type CompanyUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
};

type Tab = "companies" | "inquiries" | "landing-pages" | "pricing" | "account";

export default function PlatformAdminClient({
  session,
}: {
  session: PlatformAdminSessionPayload;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("companies");

  async function handleLogout() {
    await fetch("/api/platform-admin/auth/logout", { method: "POST" });
    // Same reasoning as the company dashboard's logout: land on the
    // public marketing page, not straight back to a login form.
    router.push("/");
    router.refresh();
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.mark}>P</div>
          <div>
            <div style={styles.companyLabel}>Platform Admin</div>
            <div style={styles.userLabel}>{session.name}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Sign out
        </button>
      </header>

      <main style={styles.main}>
        <div style={styles.tabRow}>
          <TabButton active={tab === "companies"} onClick={() => setTab("companies")}>
            Companies
          </TabButton>
          <TabButton active={tab === "inquiries"} onClick={() => setTab("inquiries")}>
            Inquiries
          </TabButton>
          <TabButton
            active={tab === "landing-pages"}
            onClick={() => setTab("landing-pages")}
          >
            Landing Pages
          </TabButton>
          <TabButton active={tab === "pricing"} onClick={() => setTab("pricing")}>
            Pricing
          </TabButton>
          <TabButton active={tab === "account"} onClick={() => setTab("account")}>
            Account
          </TabButton>
        </div>

        {tab === "companies" && <CompaniesTab />}
        {tab === "inquiries" && <InquiriesTab />}
        {tab === "landing-pages" && <LandingPagesTab />}
        {tab === "pricing" && <PricingTab />}
        {tab === "account" && <AccountTab />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{ ...styles.tabButton, ...(active ? styles.tabButtonActive : {}) }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Companies tab
// ============================================================================
function CompaniesTab() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-admin/companies");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load companies");
      } else {
        setCompanies(json.companies ?? []);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={styles.sectionTitleRow}>
        <div>
          <h2 style={styles.h2}>Companies</h2>
          <p style={styles.sectionSubtitle}>
            Every company on the platform. Create new ones here when onboarding a
            customer — this also creates their first admin login.
          </p>
        </div>
        <button onClick={() => setShowCreateForm(true)} style={styles.primaryButton}>
          + New company
        </button>
      </div>

      {showCreateForm && (
        <CreateCompanyForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            fetchCompanies();
          }}
        />
      )}

      {loading && <div style={styles.loading}>Loading companies…</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      {!loading && !error && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Company</th>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Twilio #</th>
                <th style={styles.th}>Plan</th>
                <th style={styles.th}>Trial</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <CompanyRow
                  key={c.id}
                  company={c}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  onUpdated={fetchCompanies}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateCompanyForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    company_name: "",
    company_code: "",
    company_email: "",
    phone: "",
    twilio_number: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create company.");
        setSubmitting(false);
        return;
      }
      onCreated();
    } catch {
      setError("Could not reach the server.");
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.formCard}>
      <form onSubmit={handleSubmit} style={styles.formGrid}>
        <FormField
          label="Company Name"
          value={form.company_name}
          onChange={(v) => update("company_name", v)}
          placeholder="Sterling Heights Apartments"
          required
        />
        <FormField
          label="Company Code"
          value={form.company_code}
          onChange={(v) => update("company_code", v)}
          placeholder="sterling"
          required
        />
        <FormField
          label="Company Email"
          value={form.company_email}
          onChange={(v) => update("company_email", v)}
          placeholder="contact@company.com"
          type="email"
          required
        />
        <FormField
          label="Company Phone"
          value={form.phone}
          onChange={(v) => update("phone", v)}
          placeholder="555-0100"
        />
        <FormField
          label="Twilio Number (optional, add more after creating)"
          value={form.twilio_number}
          onChange={(v) => update("twilio_number", v)}
          placeholder="+15551234567"
        />
        <div style={styles.formDivider} />
        <FormField
          label="Admin Name"
          value={form.admin_name}
          onChange={(v) => update("admin_name", v)}
          placeholder="Jane Smith"
          required
        />
        <FormField
          label="Admin Email"
          value={form.admin_email}
          onChange={(v) => update("admin_email", v)}
          placeholder="jane@company.com"
          type="email"
          required
        />
        <FormField
          label="Admin Password"
          value={form.admin_password}
          onChange={(v) => update("admin_password", v)}
          placeholder="At least 8 characters"
          required
        />

        {error && <div style={styles.formError}>{error}</div>}

        <div style={styles.formActions}>
          <button type="submit" disabled={submitting} style={styles.primaryButton}>
            {submitting ? "Creating…" : "Create company"}
          </button>
          <button type="button" onClick={onClose} style={styles.secondaryButton}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function CompanyRow({
  company,
  expanded,
  onToggle,
  onUpdated,
}: {
  company: Company;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ ...styles.tr, ...(expanded ? styles.trExpanded : {}) }}>
        <td style={styles.td}>{company.company_name}</td>
        <td style={{ ...styles.td, ...styles.mono }}>{company.company_code}</td>
        <td style={{ ...styles.td, ...styles.mono }}>
          {company.twilio_numbers.length === 0 ? (
            <Muted>—</Muted>
          ) : company.twilio_numbers.length === 1 ? (
            company.twilio_numbers[0].phone_number
          ) : (
            `${company.twilio_numbers[0].phone_number} +${company.twilio_numbers.length - 1} more`
          )}
        </td>
        <td style={styles.td}>{capitalize(company.subscription_plan)}</td>
        <td style={styles.td}>
          <TrialBadge company={company} />
        </td>
        <td style={styles.td}>
          <StatusBadge status={company.status} />
        </td>
        <td style={{ ...styles.td, ...styles.mono }}>{formatDate(company.created_at)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={styles.expandedCell}>
            <CompanyDetail company={company} onUpdated={onUpdated} />
          </td>
        </tr>
      )}
    </>
  );
}

function CompanyDetail({
  company,
  onUpdated,
}: {
  company: Company;
  onUpdated: () => void;
}) {
  const [plan, setPlan] = useState(company.subscription_plan);
  const [status, setStatus] = useState(company.status);
  const [uploading, setUploading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/platform-admin/companies/${company.id}/users`);
      const json = await res.json();
      if (res.ok) setUsers(json.users ?? []);
    } finally {
      setUsersLoading(false);
    }
  }

  async function patchCompany(updates: Record<string, unknown>) {
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/platform-admin/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg(data.error || "Update failed.");
        return;
      }
      setSaveMsg("✓ Saved");
      onUpdated();
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg("Could not reach the server.");
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setSaveMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/platform-admin/companies/${company.id}/logo`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg(data.error || "Upload failed.");
      } else {
        setSaveMsg("✓ Logo uploaded");
        onUpdated();
      }
    } catch {
      setSaveMsg("Could not reach the server.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={styles.detailWrap}>
      <div style={styles.detailGrid}>
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Plan</label>
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              patchCompany({ subscription_plan: e.target.value });
            }}
            style={styles.input}
          >
            <option value="trial">Trial</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {company.subscription_plan === "trial" && (
          <div style={styles.detailField}>
            <label style={styles.detailLabel}>
              Trial ends{" "}
              {company.trial_ends_at &&
                `(${formatDate(company.trial_ends_at)})`}
            </label>
            <div style={styles.inlineRow}>
              <button
                onClick={() => patchCompany({ trial_ends_at: addDaysFromNow(7) })}
                style={styles.secondaryButton}
              >
                +7 days
              </button>
              <button
                onClick={() => patchCompany({ trial_ends_at: addDaysFromNow(14) })}
                style={styles.secondaryButton}
              >
                +14 days
              </button>
              <button
                onClick={() => patchCompany({ trial_ends_at: addDaysFromNow(0) })}
                style={{ ...styles.secondaryButton, color: "#A8392B", borderColor: "#EFC9C0" }}
              >
                Expire now
              </button>
            </div>
          </div>
        )}

        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              patchCompany({ status: e.target.value });
            }}
            style={styles.input}
          >
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Logo</label>
          <div style={styles.inlineRow}>
            {company.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt="" style={styles.logoPreview} />
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoUpload}
              disabled={uploading}
              style={styles.fileInput}
            />
          </div>
          <p style={styles.hint}>
            Upload directly on behalf of a customer who doesn't have their own
            hosted image. They'll see it immediately on their dashboard.
          </p>
        </div>
      </div>

      {saveMsg && <div style={styles.saveMsg}>{saveMsg}</div>}

      <NumbersSection companyId={company.id} initialNumbers={company.twilio_numbers} onUpdated={onUpdated} />

      <div style={styles.usersSection}>
        <div style={styles.detailLabel}>Logins at this company</div>
        {usersLoading ? (
          <div style={styles.loading}>Loading…</div>
        ) : users.length === 0 ? (
          <p style={styles.hint}>No users found — something may have gone wrong during creation.</p>
        ) : (
          <div style={styles.usersTable}>
            {users.map((u) => (
              <CompanyUserRow key={u.id} companyId={company.id} user={u} />
            ))}
          </div>
        )}
      </div>

      <DangerZone company={company} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// NumbersSection
//
// Lets you add, deactivate, reactivate, or remove any number of Twilio
// numbers for one company. Every number listed here routes to the SAME
// shared greeting/config (company_settings) — there's no per-number
// customization, per your choice. This is purely "which numbers ring
// through to this company's assistant," not "which assistant."
// ----------------------------------------------------------------------------
function NumbersSection({
  companyId,
  initialNumbers,
  onUpdated,
}: {
  companyId: string;
  initialNumbers: TwilioNumber[];
  onUpdated: () => void;
}) {
  const [numbers, setNumbers] = useState<TwilioNumber[]>(initialNumbers);
  const [newNumber, setNewNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch(`/api/platform-admin/companies/${companyId}/numbers`);
      const json = await res.json();
      if (res.ok) setNumbers(json.numbers ?? []);
    } catch {
      // Keep showing the last known list rather than clearing it on a
      // transient fetch failure.
    }
  }

  async function handleAdd() {
    if (!newNumber.trim()) {
      setMsg("Enter a phone number first.");
      return;
    }
    setAdding(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/platform-admin/companies/${companyId}/numbers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: newNumber.trim(), label: newLabel.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Failed to add number.");
        setAdding(false);
        return;
      }
      setNewNumber("");
      setNewLabel("");
      await refresh();
      onUpdated();
    } catch {
      setMsg("Could not reach the server.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleActive(number: TwilioNumber) {
    setMsg(null);
    try {
      const res = await fetch(
        `/api/platform-admin/companies/${companyId}/numbers/${number.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !number.active }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setMsg(data.error || "Update failed.");
        return;
      }
      await refresh();
      onUpdated();
    } catch {
      setMsg("Could not reach the server.");
    }
  }

  async function handleRemove(number: TwilioNumber) {
    setMsg(null);
    try {
      const res = await fetch(
        `/api/platform-admin/companies/${companyId}/numbers/${number.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        setMsg(data.error || "Remove failed.");
        return;
      }
      await refresh();
      onUpdated();
    } catch {
      setMsg("Could not reach the server.");
    }
  }

  return (
    <div style={styles.usersSection}>
      <div style={styles.detailLabel}>
        Phone numbers ({numbers.length}) — all share the same greeting
      </div>

      {numbers.length === 0 ? (
        <p style={styles.hint}>No numbers yet — add one below.</p>
      ) : (
        <div style={styles.usersTable}>
          {numbers.map((n) => (
            <div key={n.id} style={styles.userRow}>
              <div style={styles.userRowMain}>
                <span style={styles.mono}>{n.phone_number}</span>
                {n.label && <span>· {n.label}</span>}
                {!n.active && <span style={{ color: "#9A6B1F" }}>(inactive)</span>}
                <button onClick={() => toggleActive(n)} style={styles.secondaryButton}>
                  {n.active ? "Deactivate" : "Reactivate"}
                </button>
                <button
                  onClick={() => handleRemove(n)}
                  style={{ ...styles.secondaryButton, color: "#A8392B", borderColor: "#EFC9C0" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...styles.inlineRow, marginTop: 12 }}>
        <input
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="+15551234567"
          style={styles.input}
        />
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Label (optional, e.g. Building B)"
          style={styles.input}
        />
        <button onClick={handleAdd} disabled={adding} style={styles.primaryButton}>
          {adding ? "Adding…" : "+ Add number"}
        </button>
      </div>
      {msg && <div style={styles.saveMsg}>{msg}</div>}
    </div>
  );
}

function CompanyUserRow({
  companyId,
  user,
}: {
  companyId: string;
  user: CompanyUser;
}) {
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function handleReset() {
    if (newPassword.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }
    try {
      const res = await fetch(
        `/api/platform-admin/companies/${companyId}/users/${user.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: newPassword }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Reset failed.");
        return;
      }
      setMsg("✓ Password reset");
      setNewPassword("");
      setResetting(false);
    } catch {
      setMsg("Could not reach the server.");
    }
  }

  return (
    <div style={styles.userRow}>
      <div style={styles.userRowMain}>
        <span>
          <strong>{user.name}</strong> · {capitalize(user.role)}
        </span>
        <span style={styles.mono}>{user.email}</span>
        <button onClick={() => setResetting(!resetting)} style={styles.secondaryButton}>
          {resetting ? "Cancel" : "Reset password"}
        </button>
      </div>
      {resetting && (
        <div style={styles.inlineRow}>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (8+ characters)"
            style={styles.input}
          />
          <button onClick={handleReset} style={styles.primaryButton}>
            Set password
          </button>
        </div>
      )}
      {msg && <div style={styles.saveMsg}>{msg}</div>}
    </div>
  );
}

function DangerZone({ company }: { company: Company }) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCancel() {
    setMsg(null);
    try {
      const res = await fetch(`/api/platform-admin/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        setMsg("✓ Company cancelled — their data is untouched, just login-blocked.");
        router.refresh();
      } else {
        setMsg("Failed to cancel.");
      }
    } catch {
      setMsg("Could not reach the server.");
    }
  }

  async function handlePermanentDelete() {
    if (confirmText !== company.company_code) {
      setMsg(`Type "${company.company_code}" exactly to confirm.`);
      return;
    }
    setDeleting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/platform-admin/companies/${company.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Delete failed.");
        setDeleting(false);
        return;
      }
      router.refresh();
      window.location.reload();
    } catch {
      setMsg("Could not reach the server.");
      setDeleting(false);
    }
  }

  return (
    <div style={styles.dangerZone}>
      <div style={styles.detailLabel}>Danger zone</div>
      <div style={styles.dangerRow}>
        <div>
          <strong>Cancel this company</strong>
          <p style={styles.hint}>
            Blocks their login immediately. All leads, calls, and recordings stay
            intact — fully reversible by switching status back to Active above.
          </p>
        </div>
        <button onClick={handleCancel} style={styles.warnButton}>
          Cancel company
        </button>
      </div>

      <div style={styles.dangerRow}>
        <div>
          <strong>Permanently delete everything</strong>
          <p style={styles.hint}>
            Deletes the company, every user login, every lead, every call
            recording and transcript. There is no undo.
          </p>
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              style={styles.dangerButton}
            >
              Delete permanently
            </button>
          ) : (
            <div style={styles.deleteConfirmBox}>
              <p style={styles.hint}>
                Type <code style={styles.code}>{company.company_code}</code> to
                confirm:
              </p>
              <div style={styles.inlineRow}>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  style={styles.input}
                  placeholder={company.company_code}
                />
                <button
                  onClick={handlePermanentDelete}
                  disabled={deleting}
                  style={styles.dangerButton}
                >
                  {deleting ? "Deleting…" : "Confirm permanent delete"}
                </button>
                <button
                  onClick={() => {
                    setConfirmingDelete(false);
                    setConfirmText("");
                  }}
                  style={styles.secondaryButton}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {msg && <div style={styles.saveMsg}>{msg}</div>}
    </div>
  );
}

// ============================================================================
// Inquiries tab
// ============================================================================
function InquiriesTab() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInquiries();
  }, []);

  async function fetchInquiries() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-admin/inquiries");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load inquiries");
      } else {
        setInquiries(json.inquiries ?? []);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await fetch(`/api/platform-admin/inquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  return (
    <div>
      <h2 style={styles.h2}>Inquiries</h2>
      <p style={styles.sectionSubtitle}>
        Requests submitted from the landing page. Review them here, then create a
        company in the Companies tab once you're ready to onboard someone.
      </p>

      {loading && <div style={styles.loading}>Loading inquiries…</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      {!loading && !error && inquiries.length === 0 && (
        <div style={styles.empty}>No inquiries yet.</div>
      )}

      {!loading && !error && inquiries.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Contact</th>
                <th style={styles.th}>Company</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Received</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inq) => (
                <tr key={inq.id} style={styles.tr}>
                  <td style={styles.td}>{inq.contact_name}</td>
                  <td style={styles.td}>{inq.company_name}</td>
                  <td style={{ ...styles.td, ...styles.mono }}>{inq.email}</td>
                  <td style={{ ...styles.td, ...styles.mono }}>
                    {inq.phone || <Muted>—</Muted>}
                  </td>
                  <td style={styles.td}>
                    <select
                      value={inq.status}
                      onChange={(e) => updateStatus(inq.id, e.target.value)}
                      style={styles.roleSelect}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="onboarded">Onboarded</option>
                      <option value="declined">Declined</option>
                    </select>
                  </td>
                  <td style={{ ...styles.td, ...styles.mono }}>
                    {formatDate(inq.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Account tab
// ============================================================================
// ============================================================================
// Landing Pages tab
// ============================================================================
function LandingPagesTab() {
  const [variants, setVariants] = useState<LandingPageVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [previewVariant, setPreviewVariant] = useState<LandingPageVariant | null>(
    null
  );
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchVariants();
  }, []);

  async function fetchVariants() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-admin/landing-page-variants");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load variants");
      } else {
        setVariants(json.variants ?? []);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(id: string) {
    setActionMsg(null);
    try {
      const res = await fetch(
        `/api/platform-admin/landing-page-variants/${id}/activate`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setActionMsg(data.error || "Failed to activate.");
        return;
      }
      setActionMsg("✓ Now live");
      fetchVariants();
      setTimeout(() => setActionMsg(null), 2000);
    } catch {
      setActionMsg("Could not reach the server.");
    }
  }

  async function handleDelete(id: string) {
    setActionMsg(null);
    try {
      const res = await fetch(`/api/platform-admin/landing-page-variants/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg(data.error || "Failed to delete.");
        return;
      }
      fetchVariants();
    } catch {
      setActionMsg("Could not reach the server.");
    }
  }

  return (
    <div>
      <div style={styles.sectionTitleRow}>
        <div>
          <h2 style={styles.h2}>Landing Pages</h2>
          <p style={styles.sectionSubtitle}>
            Switch which design is live on the public marketing page with one
            click, or upload a new raw-HTML variant.
          </p>
        </div>
        <button onClick={() => setShowAddForm(true)} style={styles.primaryButton}>
          + Add variant
        </button>
      </div>

      {showAddForm && (
        <AddVariantForm
          onClose={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false);
            fetchVariants();
          }}
        />
      )}

      {previewVariant && (
        <div style={styles.previewOverlay} onClick={() => setPreviewVariant(null)}>
          <div style={styles.previewModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.previewModalHeader}>
              <strong>{previewVariant.name}</strong>
              <button
                onClick={() => setPreviewVariant(null)}
                style={styles.secondaryButton}
              >
                Close preview
              </button>
            </div>
            <iframe
              srcDoc={previewVariant.html_content}
              style={styles.previewIframe}
              title={`Preview of ${previewVariant.name}`}
            />
          </div>
        </div>
      )}

      {loading && <div style={styles.loading}>Loading variants…</div>}
      {error && <div style={styles.errorBox}>{error}</div>}
      {actionMsg && <div style={styles.saveMsg}>{actionMsg}</div>}

      {!loading && !error && (
        <div style={styles.variantGrid}>
          {variants.map((v) => (
            <div
              key={v.id}
              style={{
                ...styles.variantCard,
                ...(v.is_live ? styles.variantCardLive : {}),
              }}
            >
              <div style={styles.variantCardHeader}>
                <strong>{v.name}</strong>
                {v.is_live && <span style={styles.liveBadge}>LIVE</span>}
              </div>
              <div
                style={{ ...styles.variantSwatch, backgroundColor: v.accent_color }}
              />
              <div style={styles.variantActions}>
                <button
                  onClick={() => setPreviewVariant(v)}
                  style={styles.secondaryButton}
                >
                  Preview
                </button>
                {!v.is_live && (
                  <button
                    onClick={() => handleActivate(v.id)}
                    style={styles.primaryButton}
                  >
                    Make live
                  </button>
                )}
                {!v.is_live && (
                  <button
                    onClick={() => handleDelete(v.id)}
                    style={{
                      ...styles.secondaryButton,
                      color: "#A8392B",
                      borderColor: "#EFC9C0",
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddVariantForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [accentColor, setAccentColor] = useState("#B5562F");
  const [htmlContent, setHtmlContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setHtmlContent(text);
    if (!name) {
      // Default the name to the filename (minus extension) as a
      // convenience — easy to rename before saving if desired.
      setName(file.name.replace(/\.html?$/i, ""));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!htmlContent) {
      setError("Upload or paste an HTML file's contents first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-admin/landing-page-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          html_content: htmlContent,
          accent_color: accentColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add variant.");
        setSubmitting(false);
        return;
      }
      onCreated();
    } catch {
      setError("Could not reach the server.");
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.formCard}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={styles.formGrid}>
          <FormField label="Variant name" value={name} onChange={setName} required />
          <div style={styles.detailField}>
            <label style={styles.detailLabel}>Accent color</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              style={{ ...styles.input, padding: 2, height: 38 }}
            />
          </div>
        </div>
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>HTML file</label>
          <input type="file" accept=".html,.htm" onChange={handleFileChange} style={styles.fileInput} />
          <p style={styles.hint}>
            Upload a complete HTML file (full document — DOCTYPE, head, body).
            New variants are never made live automatically; activate it
            afterward when you're ready.
          </p>
        </div>

        {error && <div style={styles.formError}>{error}</div>}

        <div style={styles.formActions}>
          <button type="submit" disabled={submitting} style={styles.primaryButton}>
            {submitting ? "Saving…" : "Save variant"}
          </button>
          <button type="button" onClick={onClose} style={styles.secondaryButton}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Pricing tab
// ============================================================================
function PricingTab() {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform-admin/pricing-plans");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load pricing plans");
      } else {
        setPlans(json.plans ?? []);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={styles.h2}>Pricing</h2>
      <p style={styles.sectionSubtitle}>
        Edit prices, names, and feature lists here — every landing page variant
        pulls these numbers live, so a change here updates the public site
        immediately, with no code or HTML edits.
      </p>

      {loading && <div style={styles.loading}>Loading plans…</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      {!loading && !error && (
        <div style={styles.variantGrid}>
          {plans.map((plan) => (
            <PricingPlanCard key={plan.id} plan={plan} onUpdated={fetchPlans} />
          ))}
        </div>
      )}
    </div>
  );
}

function PricingPlanCard({
  plan,
  onUpdated,
}: {
  plan: PricingPlan;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(plan.name);
  const [tagline, setTagline] = useState(plan.tagline);
  const [description, setDescription] = useState(plan.description);
  const [setupFee, setSetupFee] = useState(String(plan.setup_fee));
  const [monthlyFee, setMonthlyFee] = useState(String(plan.monthly_fee));
  const [featuresText, setFeaturesText] = useState(plan.features.join("\n"));
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/platform-admin/pricing-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          tagline,
          description,
          setup_fee: parseInt(setupFee, 10) || 0,
          monthly_fee: parseInt(monthlyFee, 10) || 0,
          features: featuresText
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Failed to save.");
      } else {
        setMsg("✓ Saved — live on the site now");
        onUpdated();
        setTimeout(() => setMsg(null), 2500);
      }
    } catch {
      setMsg("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...styles.formCard, minWidth: 320 }}>
      <div style={styles.cardTitle}>
        {plan.name} {plan.is_featured && <span style={styles.liveBadge}>FEATURED</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FormField label="Plan name" value={name} onChange={setName} />
        <FormField label="Tagline" value={tagline} onChange={setTagline} />
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...styles.input, minHeight: 60, fontFamily: "inherit" }}
          />
        </div>
        <div style={styles.formGrid}>
          <FormField label="Setup fee ($)" value={setupFee} onChange={setSetupFee} type="number" />
          <FormField label="Monthly fee ($)" value={monthlyFee} onChange={setMonthlyFee} type="number" />
        </div>
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Features (one per line)</label>
          <textarea
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            style={{ ...styles.input, minHeight: 110, fontFamily: "inherit" }}
          />
        </div>
        {msg && <div style={styles.saveMsg}>{msg}</div>}
        <button onClick={handleSave} disabled={saving} style={styles.primaryButton}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SiteSettingsCard
//
// Lets you set a background color and/or image for each of the two
// login screens independently (company login vs platform-admin login)
// -- closes the gap where these were previously only changeable by
// editing code. A live preview swatch shows the color before saving;
// the actual login page itself is the real "preview" beyond that, since
// these are full-page backgrounds rather than something easy to mock
// up in a small card.
// ----------------------------------------------------------------------------
function SiteSettingsCard() {
  const [companyColor, setCompanyColor] = useState("#F4EEE3");
  const [companyImage, setCompanyImage] = useState("");
  const [platformColor, setPlatformColor] = useState("#1C1815");
  const [platformImage, setPlatformImage] = useState("");
  const [contactEmail, setContactEmail] = useState("hello@yourdomain.com");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/platform-admin/site-settings");
      const json = await res.json();
      if (res.ok && json.settings) {
        setCompanyColor(json.settings.login_background_color ?? "#F4EEE3");
        setCompanyImage(json.settings.login_background_image ?? "");
        setPlatformColor(json.settings.platform_login_background_color ?? "#1C1815");
        setPlatformImage(json.settings.platform_login_background_image ?? "");
        setContactEmail(json.settings.contact_email ?? "hello@yourdomain.com");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/platform-admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login_background_color: companyColor,
          login_background_image: companyImage || null,
          platform_login_background_color: platformColor,
          platform_login_background_image: platformImage || null,
          contact_email: contactEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Failed to save.");
      } else {
        setMsg("✓ Saved — visible on both login pages and the landing page footer now");
        setTimeout(() => setMsg(null), 2500);
      }
    } catch {
      setMsg("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={styles.loading}>Loading site settings…</div>;
  }

  return (
    <div style={styles.formCard}>
      <div style={styles.cardTitle}>Login page backgrounds</div>
      <p style={styles.sectionSubtitle}>
        A background color and an optional image, set independently for each
        login screen.
      </p>
      <div style={styles.formGrid}>
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Footer contact email</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@yourdomain.com"
            style={styles.input}
          />
        </div>
        <div style={{ ...styles.detailField, visibility: "hidden" }} />
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>User login — background color</label>
          <div style={styles.inlineRow}>
            <input
              type="color"
              value={companyColor}
              onChange={(e) => setCompanyColor(e.target.value)}
              style={{ ...styles.input, padding: 2, height: 38, width: 60 }}
            />
            <input
              type="text"
              value={companyColor}
              onChange={(e) => setCompanyColor(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>User login — background image URL</label>
          <input
            type="text"
            value={companyImage}
            onChange={(e) => setCompanyImage(e.target.value)}
            placeholder="https://… (optional)"
            style={styles.input}
          />
        </div>
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Admin login — background color</label>
          <div style={styles.inlineRow}>
            <input
              type="color"
              value={platformColor}
              onChange={(e) => setPlatformColor(e.target.value)}
              style={{ ...styles.input, padding: 2, height: 38, width: 60 }}
            />
            <input
              type="text"
              value={platformColor}
              onChange={(e) => setPlatformColor(e.target.value)}
              style={styles.input}
            />
          </div>
        </div>
        <div style={styles.detailField}>
          <label style={styles.detailLabel}>Admin login — background image URL</label>
          <input
            type="text"
            value={platformImage}
            onChange={(e) => setPlatformImage(e.target.value)}
            placeholder="https://… (optional)"
            style={styles.input}
          />
        </div>
      </div>
      {msg && <div style={styles.saveMsg}>{msg}</div>}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ ...styles.primaryButton, marginTop: 14 }}
      >
        {saving ? "Saving…" : "Save backgrounds"}
      </button>
    </div>
  );
}

function AccountTab() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdmins();
  }, []);

  async function fetchAdmins() {
    setLoading(true);
    try {
      const res = await fetch("/api/platform-admin/admins");
      const json = await res.json();
      if (res.ok) setAdmins(json.admins ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 style={styles.h2}>Account</h2>
      <p style={styles.sectionSubtitle}>
        Change your own password, or add another platform admin account.
      </p>

      <div style={styles.accountGrid}>
        <ChangePasswordCard />
        <AddAdminCard onAdded={fetchAdmins} />
      </div>

      <div style={{ marginTop: 20 }}>
        <SiteSettingsCard />
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={styles.detailLabel}>Existing platform admins</div>
        {loading ? (
          <div style={styles.loading}>Loading…</div>
        ) : (
          <ul style={styles.adminList}>
            {admins.map((a) => (
              <li key={a.id} style={styles.adminListItem}>
                <strong>{a.name}</strong> <span style={styles.mono}>{a.email}</span>{" "}
                {!a.active && <Muted>(inactive)</Muted>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/platform-admin/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Failed to change password.");
      } else {
        setStatus("✓ Password changed");
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch {
      setStatus("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.formCard}>
      <div style={styles.cardTitle}>Change your password</div>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <FormField
          label="Current Password"
          value={currentPassword}
          onChange={setCurrentPassword}
          type="password"
          required
        />
        <FormField
          label="New Password"
          value={newPassword}
          onChange={setNewPassword}
          type="password"
          placeholder="At least 8 characters"
          required
        />
        {status && <div style={styles.saveMsg}>{status}</div>}
        <button type="submit" disabled={submitting} style={styles.primaryButton}>
          {submitting ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

function AddAdminCard({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/platform-admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Failed to add admin.");
      } else {
        setStatus("✓ Admin added");
        setName("");
        setEmail("");
        setPassword("");
        onAdded();
      }
    } catch {
      setStatus("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.formCard}>
      <div style={styles.cardTitle}>Add another platform admin</div>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <FormField label="Name" value={name} onChange={setName} required />
        <FormField label="Email" value={email} onChange={setEmail} type="email" required />
        <FormField
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          placeholder="At least 8 characters"
          required
        />
        {status && <div style={styles.saveMsg}>{status}</div>}
        <button type="submit" disabled={submitting} style={styles.primaryButton}>
          {submitting ? "Adding…" : "Add admin"}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// Shared small components
// ============================================================================
function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div style={styles.detailField}>
      <label style={styles.detailLabel}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={styles.input}
      />
    </div>
  );
}

function TrialBadge({ company }: { company: Company }) {
  if (company.subscription_plan !== "trial") {
    return <Muted>—</Muted>;
  }
  if (!company.trial_ends_at) {
    return <Muted>Not started</Muted>;
  }

  const endsAt = new Date(company.trial_ends_at);
  const now = new Date();
  const daysRemaining = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) {
    return (
      <span style={{ ...styles.badge, backgroundColor: "#FBEAE6", color: "#A8392B" }}>
        Expired
      </span>
    );
  }
  if (daysRemaining <= 3) {
    return (
      <span style={{ ...styles.badge, backgroundColor: "#FBF1E2", color: "#9A6B1F" }}>
        {daysRemaining}d left
      </span>
    );
  }
  return (
    <span style={{ ...styles.badge, backgroundColor: "#E8F0E9", color: "#4B6651" }}>
      {daysRemaining}d left
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    active: { bg: "#E8F0E9", fg: "#4B6651" },
    suspended: { bg: "#FBF1E2", fg: "#9A6B1F" },
    cancelled: { bg: "#FBEAE6", fg: "#A8392B" },
  };
  const colors = colorMap[status] ?? colorMap.active;
  return (
    <span style={{ ...styles.badge, backgroundColor: colors.bg, color: colors.fg }}>
      {capitalize(status)}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#8A8378" }}>{children}</span>;
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

// Returns an ISO timestamp `days` days from right now — used by the
// trial extension buttons ("+7 days", "+14 days", "Expire now" passes
// 0). Always computed from the current moment, not from the existing
// trial_ends_at, so clicking "+7 days" twice in a row gives a sensible
// result (7 days from now, not 14 days from the old date) rather than
// compounding unexpectedly.
function addDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#F4EFE5" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 32px",
    borderBottom: "1px solid #E4DDD0",
    background: "#1C1815",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 7,
    background: "#FBF8F3",
    color: "#1C1815",
    fontWeight: 700,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  companyLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#FBF8F3",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  userLabel: { fontSize: 12.5, color: "rgba(251,248,243,0.65)" },
  logoutButton: {
    background: "transparent",
    border: "1px solid rgba(251,248,243,0.3)",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13.5,
    color: "#FBF8F3",
    cursor: "pointer",
  },
  main: { maxWidth: 1180, margin: "0 auto", padding: "32px 32px 64px" },
  tabRow: { display: "flex", gap: 8, marginBottom: 24 },
  tabButton: {
    background: "transparent",
    border: "none",
    padding: "10px 16px",
    fontSize: 14,
    color: "#6B6358",
    cursor: "pointer",
    borderRadius: 6,
    fontWeight: 500,
  },
  tabButtonActive: { background: "#1C1815", color: "#FBF8F3", fontWeight: 600 },
  h2: { fontSize: 22, fontWeight: 700, margin: 0, color: "#1C1815" },
  sectionTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    gap: 12,
    flexWrap: "wrap",
  },
  sectionSubtitle: { color: "#6B6358", fontSize: 13.5, marginTop: 6, maxWidth: 560 },
  loading: { color: "#6B6358", fontSize: 14 },
  errorBox: {
    background: "#FBEAE6",
    color: "#A8392B",
    border: "1px solid #EFC9C0",
    borderRadius: 6,
    padding: "12px 14px",
    fontSize: 13.5,
  },
  empty: {
    color: "#6B6358",
    fontSize: 14,
    background: "white",
    border: "1px solid #E4DDD0",
    borderRadius: 8,
    padding: 20,
  },
  primaryButton: {
    background: "#B5562F",
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "10px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    background: "transparent",
    border: "1px solid #E4DDD0",
    color: "#1C1815",
    borderRadius: 6,
    padding: "9px 14px",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  formCard: {
    background: "white",
    border: "1px solid #E4DDD0",
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: { fontSize: 14, fontWeight: 700, marginBottom: 14, color: "#1C1815" },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
    alignItems: "end",
  },
  formDivider: { gridColumn: "1 / -1", borderTop: "1px solid #E4DDD0", margin: "4px 0" },
  formError: {
    gridColumn: "1 / -1",
    background: "#FBEAE6",
    color: "#A8392B",
    border: "1px solid #EFC9C0",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
  },
  formActions: { display: "flex", gap: 10, gridColumn: "1 / -1" },
  tableWrap: {
    background: "white",
    border: "1px solid #E4DDD0",
    borderRadius: 8,
    overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    fontSize: 11.5,
    fontWeight: 600,
    color: "#6B6358",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    borderBottom: "1px solid #E4DDD0",
    background: "#F7F2E9",
  },
  tr: { cursor: "pointer", borderBottom: "1px solid #E4DDD0" },
  trExpanded: { background: "#FBF8F3" },
  td: { padding: "12px 16px", color: "#1C1815" },
  mono: { fontFamily: "monospace", fontSize: 12.5 },
  badge: {
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 4,
  },
  expandedCell: { padding: 0, background: "#FBF8F3", borderBottom: "1px solid #E4DDD0" },
  detailWrap: { padding: "20px 24px 24px" },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  detailField: { display: "flex", flexDirection: "column", gap: 6 },
  detailLabel: {
    fontSize: 11.5,
    fontWeight: 600,
    color: "#6B6358",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  inlineRow: { display: "flex", gap: 8, alignItems: "center" },
  input: {
    border: "1px solid #E4DDD0",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 13.5,
    background: "white",
    color: "#1C1815",
    width: "100%",
  },
  fileInput: { fontSize: 12.5 },
  logoPreview: {
    width: 32,
    height: 32,
    borderRadius: 6,
    objectFit: "contain",
    border: "1px solid #E4DDD0",
  },
  hint: { fontSize: 11.5, color: "#8A8378", marginTop: 4, lineHeight: 1.5 },
  saveMsg: { fontSize: 12.5, color: "#4B6651", marginTop: 12, fontWeight: 600 },
  roleSelect: {
    border: "1px solid #E4DDD0",
    borderRadius: 4,
    padding: "5px 8px",
    fontSize: 12.5,
    background: "white",
    color: "#1C1815",
  },
  accountGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  adminList: { listStyle: "none", padding: 0, margin: "10px 0 0", fontSize: 13.5 },
  adminListItem: {
    padding: "8px 0",
    borderBottom: "1px solid #E4DDD0",
    display: "flex",
    gap: 10,
  },
  usersSection: {
    marginTop: 22,
    paddingTop: 18,
    borderTop: "1px solid #E4DDD0",
  },
  usersTable: { marginTop: 10, display: "flex", flexDirection: "column", gap: 10 },
  userRow: {
    background: "white",
    border: "1px solid #E4DDD0",
    borderRadius: 6,
    padding: "10px 14px",
  },
  userRowMain: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    fontSize: 13.5,
    flexWrap: "wrap",
  },
  dangerZone: {
    marginTop: 22,
    paddingTop: 18,
    borderTop: "1px solid #E4DDD0",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  dangerRow: {
    background: "white",
    border: "1px solid #EFC9C0",
    borderRadius: 6,
    padding: "14px 16px",
    fontSize: 13.5,
  },
  warnButton: {
    background: "transparent",
    border: "1px solid #9A6B1F",
    color: "#9A6B1F",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
    marginTop: 8,
  },
  dangerButton: {
    background: "#A8392B",
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  deleteConfirmBox: { marginTop: 10 },
  code: {
    fontFamily: "monospace",
    background: "#F2ECE1",
    padding: "1px 6px",
    borderRadius: 3,
  },
  variantGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16,
  },
  variantCard: {
    background: "white",
    border: "1px solid #E4DDD0",
    borderRadius: 8,
    padding: 16,
  },
  variantCardLive: { border: "2px solid #B5562F" },
  variantCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    fontSize: 14,
  },
  liveBadge: {
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: 700,
    color: "#B5562F",
    border: "1px solid #B5562F",
    borderRadius: 3,
    padding: "2px 6px",
  },
  variantSwatch: {
    width: "100%",
    height: 50,
    borderRadius: 6,
    marginBottom: 12,
  },
  variantActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  previewOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
    padding: 24,
  },
  previewModal: {
    background: "white",
    borderRadius: 8,
    width: "100%",
    maxWidth: 1000,
    height: "85vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  previewModalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #E4DDD0",
  },
  previewIframe: {
    flex: 1,
    width: "100%",
    border: "none",
  },
};
