import {
  getPrimaryBusiness,
  listCalls,
  listMissedRequests,
  getContactsByIds,
} from "@/lib/data";
import { formatTime, formatDuration, statusBadge } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const business = await getPrimaryBusiness();

  if (!business) {
    return (
      <Shell title="Dashboard">
        <p style={{ color: "var(--muted)" }}>
          No business found. Run <code>supabase/seed.sql</code> to create the demo
          tenant, then reload.
        </p>
      </Shell>
    );
  }

  const tz = business.timezone;
  const [calls, missed] = await Promise.all([
    listCalls(business.id, 100),
    listMissedRequests(business.id, 100),
  ]);

  const contactIds = [
    ...calls.map((c) => c.contact_id),
    ...missed.map((r) => r.contact_id),
  ].filter((id): id is string => Boolean(id));
  const contacts = await getContactsByIds(business.id, contactIds);

  const callsToday = calls.filter((c) => isToday(c.created_at, tz)).length;
  const missedToday = calls.filter(
    (c) => c.status === "missed" && isToday(c.created_at, tz),
  ).length;
  const answeredToday = calls.filter(
    (c) => c.status === "answered" && isToday(c.created_at, tz),
  ).length;
  const answeredRate =
    answeredToday + missedToday > 0
      ? Math.round((answeredToday / (answeredToday + missedToday)) * 100)
      : null;

  return (
    <Shell title={`${business.name} — Dashboard`}>
      <div style={cardRow}>
        <Stat label="Calls today" value={String(callsToday)} />
        <Stat label="Missed today" value={String(missedToday)} accent="#ef4444" />
        <Stat
          label="Answered rate"
          value={answeredRate === null ? "—" : `${answeredRate}%`}
          accent="#22c55e"
        />
        <Stat label="Open callbacks" value={String(missed.length)} accent="#eab308" />
      </div>

      <Section title="Callback queue">
        {missed.length === 0 ? (
          <Empty text="No open callbacks." />
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <Th>Caller</Th>
                <Th>Title</Th>
                <Th>Created</Th>
                <Th>Due</Th>
              </tr>
            </thead>
            <tbody>
              {missed.map((r) => {
                const contact = r.contact_id ? contacts.get(r.contact_id) : null;
                return (
                  <tr key={r.id} style={rowBorder}>
                    <Td>{contact?.name || contact?.phone || "Unknown"}</Td>
                    <Td>{r.title}</Td>
                    <Td>{formatTime(r.created_at, tz)}</Td>
                    <Td>{formatTime(r.due_at, tz)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Recent calls">
        {calls.length === 0 ? (
          <Empty text="No calls yet. Call your Twilio number to see it here." />
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <Th>Caller</Th>
                <Th>Status</Th>
                <Th>Routed to</Th>
                <Th>Time</Th>
                <Th>Duration</Th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => {
                const contact = c.contact_id ? contacts.get(c.contact_id) : null;
                const badge = statusBadge(c);
                return (
                  <tr key={c.id} style={rowBorder}>
                    <Td>
                      {contact?.name || c.from_number || "Unknown"}
                      {contact?.name && c.from_number ? (
                        <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                          {c.from_number}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <span style={{ color: badge.color, fontWeight: 600 }}>
                        {badge.label}
                      </span>
                    </Td>
                    <Td>{c.route_target || "—"}</Td>
                    <Td>{formatTime(c.created_at, tz)}</Td>
                    <Td>{formatDuration(c.duration_seconds)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </Shell>
  );
}

// --- date helper ------------------------------------------------------------
function isToday(iso: string, tz: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso)) === fmt.format(new Date());
}

// --- presentational bits ----------------------------------------------------
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>{title}</h1>
      {children}
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={statCard}>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ?? "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ color: "var(--muted)" }}>{text}</p>;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 12px", fontSize: 14 }}>{children}</td>;
}

const cardRow: React.CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap" };
const statCard: React.CSSProperties = {
  flex: "1 1 180px",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "16px 20px",
};
const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  overflow: "hidden",
};
const rowBorder: React.CSSProperties = { borderTop: "1px solid var(--border)" };
