import { card, colors } from "./ui";

/** A single metric tile: small label over a large value. */
export function StatCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div style={{ ...card, flex: "1 1 180px", padding: "16px 20px" }}>
      <div style={{ color: colors.muted, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent ?? colors.foreground }}>
        {value}
      </div>
      {hint ? <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

/** Flex row wrapper for a set of StatCards. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>{children}</div>;
}
