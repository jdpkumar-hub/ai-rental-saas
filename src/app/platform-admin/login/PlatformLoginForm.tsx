"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

// ----------------------------------------------------------------------------
// PlatformLoginForm — themed by the LIVE landing variant's accent color,
// same as the company login, so both doors match the public site. The
// admin page keeps its "dark room" character: the background is a deep
// shade MIXED from the accent (accent 45% into near-black), so a green
// theme gives a deep green door, a pink theme a deep plum, etc.
// ----------------------------------------------------------------------------
export default function PlatformLoginForm({
  accentColor,
  backgroundImage,
}: {
  accentColor: string;
  backgroundImage: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/platform-admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      router.push("/platform-admin");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  const themedDark = `color-mix(in srgb, ${accentColor} 45%, #14110E)`;

  return (
    <div
      style={{
        ...styles.page,
        background: backgroundImage
          ? `url(${backgroundImage}) center/cover no-repeat, ${themedDark}`
          : `radial-gradient(circle at 30% 0%, color-mix(in srgb, ${accentColor} 60%, #14110E) 0%, ${themedDark} 60%)`,
      }}
    >
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <div style={{ ...styles.mark, background: accentColor }}>P</div>
          <div>
            <div style={styles.brandName}>Platform Admin</div>
            <div style={styles.brandSub}>Manage every company on the platform</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.fieldWrap}>
            <span style={styles.label}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              style={styles.input}
            />
          </label>
          <label style={styles.fieldWrap}>
            <span style={styles.label}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
          </label>

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
    maxWidth: 380,
    background: "#FBF8F3",
    borderRadius: 10,
    boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
    padding: "32px 32px 28px",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 28 },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 8,
    color: "white",
    fontWeight: 700,
    fontSize: 19,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  brandName: { fontWeight: 700, fontSize: 17, color: "#1C1815", lineHeight: 1.2 },
  brandSub: { fontSize: 12.5, color: "#6B6358", marginTop: 2 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6B6358",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    border: "1px solid #E4DDD0",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 15,
    background: "#FFFEFC",
    color: "#1C1815",
  },
  error: {
    background: "#FBEAE6",
    color: "#A8392B",
    border: "1px solid #EFC9C0",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 13.5,
  },
  button: {
    marginTop: 4,
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "11px 16px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};
