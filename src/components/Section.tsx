import type { ReactNode } from "react";
import { colors } from "./ui";

/** A titled content block with consistent vertical rhythm. */
export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section style={{ marginTop: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
        {actions ?? null}
      </div>
      {children}
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <p style={{ color: colors.muted }}>{text}</p>;
}
