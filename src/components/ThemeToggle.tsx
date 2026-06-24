"use client";

import { useTheme } from "./ThemeProvider";

/** Sun/moon toggle. Sits in the sidebar footer. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        color: "var(--muted-strong)",
        background: "transparent",
        border: "1px solid var(--border)",
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
        {dark ? "☀" : "☾"}
      </span>
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
