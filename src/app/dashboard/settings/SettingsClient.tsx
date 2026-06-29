"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/session";

type Branding = {
  company_name: string;
  logo_url: string | null;
  brand_color: string;
};

const PRESET_COLORS = [
  { name: "Clay (default)", value: "#B5562F" },
  { name: "Forest", value: "#2F5233" },
  { name: "Navy", value: "#1F3A5F" },
  { name: "Plum", value: "#5B3A5C" },
  { name: "Charcoal", value: "#33312E" },
];

export default function SettingsClient({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#B5562F");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useEffect(() => {
    fetchBranding();
  }, []);

  async function fetchBranding() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company-branding");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load branding");
      } else {
        setBranding(json.branding);
        setLogoUrl(json.branding.logo_url ?? "");
        setBrandColor(json.branding.brand_color ?? "#B5562F");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/company-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: logoUrl || null, brand_color: brandColor }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus("error");
        setError(data.error || "Failed to save.");
        return;
      }
      setBranding(data.branding);
      setSaveStatus("saved");
      setError(null);
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setError("Could not reach the server.");
    }
  }

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
          <a href="/dashboard/users" style={styles.navLink}>
            Users
          </a>
          <a
            href="/dashboard/settings"
            style={{ ...styles.navLink, ...styles.navLinkActive }}
          >
            Settings
          </a>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Sign out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <h1 style={styles.h1}>Branding</h1>
        <p style={styles.subtitle}>
          Your logo and accent color show up across your entire dashboard — the nav
          bar, buttons, and highlights everywhere.
        </p>

        {loading && <div style={styles.loading}>Loading…</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {branding && (
          <div style={styles.layout}>
            <div style={styles.formCard}>
              <div style={styles.field}>
                <label style={styles.label}>Logo URL</label>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => {
                    setLogoUrl(e.target.value);
                    setLogoLoadFailed(false);
                  }}
                  placeholder="https://yoursite.com/logo.png"
                  style={styles.input}
                />
                <p style={styles.hint}>
                  Paste a link to a publicly accessible image. Leave blank to use the
                  default mark. (Direct file upload isn't available yet — host the
                  image somewhere and paste its link here.)
                </p>
                {logoLoadFailed && logoUrl && (
                  <p style={styles.warningHint}>
                    ⚠ Couldn't load an image from that URL — double check the link is
                    correct and publicly accessible.
                  </p>
                )}
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Accent Color</label>
                <div style={styles.colorRow}>
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    style={styles.colorPicker}
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    style={{ ...styles.input, ...styles.colorTextInput }}
                  />
                </div>
                <div style={styles.presetRow}>
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setBrandColor(preset.value)}
                      title={preset.name}
                      style={{
                        ...styles.presetSwatch,
                        backgroundColor: preset.value,
                        outline:
                          brandColor.toLowerCase() === preset.value.toLowerCase()
                            ? "2px solid var(--color-ink)"
                            : "1px solid var(--color-border)",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={styles.saveRow}>
                <button onClick={handleSave} style={styles.saveButton}>
                  {saveStatus === "saving" ? "Saving…" : "Save branding"}
                </button>
                {saveStatus === "saved" && (
                  <span style={styles.savedHint}>
                    ✓ Saved — refresh to see it everywhere
                  </span>
                )}
                {saveStatus === "error" && (
                  <span style={styles.errorHint}>⚠ Couldn't save — try again</span>
                )}
              </div>
            </div>

            <div style={styles.previewCard}>
              <div style={styles.previewLabel}>Live preview</div>
              <div style={styles.previewHeader}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    style={styles.previewLogo}
                    onError={() => setLogoLoadFailed(true)}
                    onLoad={() => setLogoLoadFailed(false)}
                  />
                ) : (
                  <div style={{ ...styles.previewMark, backgroundColor: brandColor }}>
                    R
                  </div>
                )}
                <div>
                  <div style={styles.previewCompanyName}>{branding.company_name}</div>
                  <div style={styles.previewUserLine}>Admin · admin</div>
                </div>
              </div>
              <div style={styles.previewNav}>
                <span style={styles.previewNavItemMuted}>Dashboard</span>
                <span
                  style={{
                    ...styles.previewNavItemActive,
                    borderBottomColor: brandColor,
                  }}
                >
                  Calls
                </span>
                <span style={styles.previewNavItemMuted}>Leads</span>
              </div>
              <button style={{ ...styles.previewButton, backgroundColor: brandColor }}>
                Example button
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
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
  main: { maxWidth: 1000, margin: "0 auto", padding: "40px 32px 64px" },
  h1: { fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, margin: 0 },
  subtitle: { color: "var(--color-ink-muted)", fontSize: 14.5, marginTop: 8, maxWidth: 560 },
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
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 340px",
    gap: 24,
    marginTop: 28,
    alignItems: "start",
  },
  formCard: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 22,
  },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  input: {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 13.5,
    background: "var(--color-bg)",
    color: "var(--color-ink)",
    fontFamily: "var(--font-body)",
  },
  hint: { fontSize: 12, color: "var(--color-ink-muted)", lineHeight: 1.5, margin: 0 },
  warningHint: {
    fontSize: 12,
    color: "var(--color-danger)",
    lineHeight: 1.5,
    margin: 0,
  },
  colorRow: { display: "flex", gap: 10, alignItems: "center" },
  colorPicker: {
    width: 44,
    height: 38,
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    cursor: "pointer",
    padding: 2,
  },
  colorTextInput: { flex: 1, fontFamily: "var(--font-mono)" },
  presetRow: { display: "flex", gap: 8, marginTop: 6 },
  presetSwatch: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    outlineOffset: 2,
  },
  saveRow: { display: "flex", alignItems: "center", gap: 14 },
  saveButton: {
    background: "var(--color-clay)",
    color: "white",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "10px 18px",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  savedHint: { fontSize: 12.5, color: "var(--color-moss)", fontWeight: 600 },
  errorHint: { fontSize: 12.5, color: "var(--color-danger)", fontWeight: 600 },
  previewCard: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    padding: 18,
    position: "sticky",
    top: 24,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    marginBottom: 14,
  },
  previewHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBottom: 14,
    borderBottom: "1px solid var(--color-border)",
    marginBottom: 14,
  },
  previewMark: {
    width: 32,
    height: 32,
    borderRadius: 7,
    color: "white",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  previewLogo: {
    width: 32,
    height: 32,
    borderRadius: 7,
    objectFit: "contain",
    flexShrink: 0,
  },
  previewCompanyName: {
    fontFamily: "var(--font-mono)",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--color-ink)",
  },
  previewUserLine: { fontSize: 11, color: "var(--color-ink-muted)" },
  previewNav: {
    display: "flex",
    gap: 14,
    marginBottom: 16,
    paddingBottom: 4,
  },
  previewNavItemMuted: { fontSize: 12, color: "var(--color-ink-muted)" },
  previewNavItemActive: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-ink)",
    borderBottom: "2px solid",
    paddingBottom: 4,
  },
  previewButton: {
    color: "white",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "8px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "default",
  },
};
