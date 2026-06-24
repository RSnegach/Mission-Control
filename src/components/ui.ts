import type { CSSProperties } from "react";

/**
 * Shared inline-style objects and color tokens, mirroring the CSS variables in
 * globals.css. Centralized so every page and component looks consistent.
 */

export const colors = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  muted: "var(--muted)",
  card: "var(--card)",
  border: "var(--border)",
  accent: "var(--accent)",
};

// Concrete hex values, for places that cannot use CSS vars (e.g. Recharts props).
export const hex = {
  background: "#0b0e14",
  foreground: "#e6e9ef",
  muted: "#9aa4b2",
  card: "#141925",
  border: "#232a3a",
  accent: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#eab308",
};

export const card: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
};

export const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  ...card,
  overflow: "hidden",
};

export const rowBorder: CSSProperties = { borderTop: `1px solid ${colors.border}` };
