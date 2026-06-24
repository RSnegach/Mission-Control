import type { ReactNode } from "react";
import { colors } from "./ui";

/** Page title + optional subtitle and right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
        {subtitle ? (
          <p style={{ color: colors.muted, fontSize: 14, margin: "6px 0 0" }}>{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}
