import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { colors } from "@/components/ui";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 28px",
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700 }}>
          <span
            aria-hidden
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 26,
              height: 26,
              borderRadius: 7,
              background: colors.accent,
              color: "var(--accent-contrast)",
              fontSize: 14,
            }}
          >
            ◉
          </span>
          Mission Control
        </span>
        <div style={{ width: 130 }}>
          <ThemeToggle />
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 640, textAlign: "center" }}>
          <h1 style={{ fontSize: 40, fontWeight: 750, margin: 0, lineHeight: 1.1 }}>
            Every call becomes tracked business work.
          </h1>
          <p style={{ color: colors.muted, fontSize: 17, margin: "18px auto 32px", maxWidth: 520, lineHeight: 1.5 }}>
            A multi-tenant phone CRM for service businesses. Calls are logged,
            matched to clients, routed, and turned into callbacks when missed.
            All in one operations dashboard.
          </p>
          <Link
            href="/dashboard"
            style={{
              display: "inline-block",
              padding: "12px 22px",
              borderRadius: 10,
              background: colors.accent,
              color: "var(--accent-contrast)",
              fontWeight: 600,
              fontSize: 15,
              textDecoration: "none",
              boxShadow: "var(--shadow)",
            }}
          >
            Open dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
