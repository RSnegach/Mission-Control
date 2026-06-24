import type { ReactNode } from "react";
import { card, colors } from "../ui";

/** Titled framed container for a chart, matching the app card style. */
export function ChartCard({
  title,
  children,
  flex = "1 1 320px",
}: {
  title: string;
  children: ReactNode;
  flex?: string;
}) {
  return (
    <div style={{ ...card, flex, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ color: colors.muted, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
