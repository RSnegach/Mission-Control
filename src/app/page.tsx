import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Mission Control
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 32 }}>
        Multi-tenant Twilio incoming calls manager. Every call becomes tracked
        business work.
      </p>
      <Link
        href="/dashboard"
        style={{
          display: "inline-block",
          padding: "10px 16px",
          borderRadius: 8,
          background: "var(--accent)",
          color: "#fff",
          fontWeight: 600,
        }}
      >
        Open dashboard
      </Link>
    </main>
  );
}
