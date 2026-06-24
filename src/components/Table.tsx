import type { CSSProperties, ReactNode } from "react";
import { colors, table as tableStyle } from "./ui";

/** Table primitives shared across pages. Plain HTML table with the app's card styling. */
export function Table({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <table style={{ ...tableStyle, ...style }}>{children}</table>;
}

export function Th({ children, align = "left" }: { children?: ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "8px 12px",
        color: colors.muted,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  colSpan,
  style,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
  style?: CSSProperties;
}) {
  return (
    <td style={{ padding: "10px 12px", fontSize: 14, textAlign: align, ...style }} colSpan={colSpan}>
      {children}
    </td>
  );
}
