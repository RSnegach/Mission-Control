import type { CSSProperties } from "react";

/**
 * Shared inline-style objects and color tokens, mirroring the CSS variables in
 * globals.css. Centralized so every page and component looks consistent.
 */

// CSS-variable references. Theme-aware automatically (the variables flip with
// the data-theme attribute). Use these everywhere except SVG charts, which
// cannot resolve var() and instead read the JS palette from useTheme().
export const colors = {
  background: "var(--background)",
  surface: "var(--surface)",
  foreground: "var(--foreground)",
  foregroundStrong: "var(--foreground-strong)",
  muted: "var(--muted)",
  mutedStrong: "var(--muted-strong)",
  card: "var(--card)",
  cardHover: "var(--card-hover)",
  border: "var(--border)",
  borderStrong: "var(--border-strong)",
  accent: "var(--accent)",
  accentHover: "var(--accent-hover)",
  success: "var(--success)",
  danger: "var(--danger)",
  warning: "var(--warning)",
};

export const card: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  boxShadow: "var(--shadow-sm)",
};

export const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  ...card,
  overflow: "hidden",
};

export const rowBorder: CSSProperties = { borderTop: `1px solid ${colors.border}` };
