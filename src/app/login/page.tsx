"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
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
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={styles.mark}>R</div>
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

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={styles.demoBox}>
          <div style={styles.demoTitle}>Demo tenants</div>
          <div style={styles.demoRow}>
            <code style={styles.demoCode}>sterling</code>
            <span style={styles.demoText}>admin@sterling.com / password123</span>
          </div>
          <div style={styles.demoRow}>
            <code style={styles.demoCode}>lakehurst</code>
            <span style={styles.demoText}>manager@lakehurst.com / password123</span>
          </div>
        </div>
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
    background:
      "radial-gradient(circle at 20% 10%, #F4EEE3 0%, #FBF8F3 45%) , var(--color-bg)",
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
    background: "var(--color-clay)",
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
    background: "var(--color-clay)",
    color: "white",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "11px 16px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  demoBox: {
    marginTop: 24,
    paddingTop: 18,
    borderTop: "1px solid var(--color-border)",
  },
  demoTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-ink-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 8,
  },
  demoRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--color-ink-muted)",
    marginBottom: 4,
  },
  demoCode: {
    fontFamily: "var(--font-mono)",
    background: "#F2ECE1",
    border: "1px solid var(--color-border)",
    borderRadius: 4,
    padding: "2px 6px",
    fontSize: 12,
    color: "var(--color-clay-dark)",
  },
  demoText: {
    fontFamily: "var(--font-mono)",
  },
};
