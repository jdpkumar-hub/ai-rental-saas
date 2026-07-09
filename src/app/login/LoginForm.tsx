"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

// ----------------------------------------------------------------------------
// Company login form, themed by the LIVE landing variant's accent color
// (passed from page.tsx). The logo mark, button, and background tint all
// derive from it, so this screen always matches the marketing page a
// visitor just came from.
// ----------------------------------------------------------------------------
export default function LoginForm({
  accentColor,
  backgroundImage,
}: {
  accentColor: string;
  backgroundImage: string | null;
}) {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        ...styles.page,
        background: backgroundImage
          ? `url(${backgroundImage}) center/cover no-repeat, color-mix(in srgb, ${accentColor} 14%, #FFFFFF)`
          : `radial-gradient(circle at 20% 10%, color-mix(in srgb, ${accentColor} 22%, #FFFFFF) 0%, var(--color-bg) 55%)`,
      }}
    >
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={{ ...styles.mark, background: accentColor }}>R</div>
          <div>
            <div style={styles.brandName}>AI Rental Office Assistant</div>
            <div style={styles.brandSub}>Sign in to your company's dashboard</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <Field
            label="Company"
            placeholder="e.g. sterling"
            value={company}
            onChange={setCompany}
            autoFocus
          />
          <Field
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={setEmail}
          />
          <Field
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={setPassword}
          />

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.button, background: accentColor }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label style={styles.fieldWrap}>
      <span style={styles.label}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        required
        style={styles.input}
      />
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    boxShadow: "var(--shadow-card)",
    padding: "32px 32px 28px",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 8,
    color: "white",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 19,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  brandName: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 17,
    color: "var(--color-ink)",
    lineHeight: 1.2,
  },
  brandSub: {
    fontSize: 13,
    color: "var(--color-ink-muted)",
    marginTop: 2,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 15,
    fontFamily: "var(--font-body)",
    background: "#FFFEFC",
    color: "var(--color-ink)",
  },
  error: {
    background: "#FBEAE6",
    color: "var(--color-danger)",
    border: "1px solid #EFC9C0",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 13.5,
  },
  button: {
    marginTop: 4,
    color: "white",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "11px 16px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};
