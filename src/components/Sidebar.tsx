"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { colors } from "./ui";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/calls", label: "Calls", icon: "☏" },
  { href: "/clients", label: "Clients", icon: "♢" },
  { href: "/requests", label: "Requests", icon: "✓" },
  { href: "/messages", label: "Messages", icon: "✉" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border}`,
        background: colors.surface,
        padding: "22px 16px",
        minHeight: "100vh",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          fontSize: 15,
          fontWeight: 700,
          color: colors.foregroundStrong,
          textDecoration: "none",
          padding: "0 8px 22px",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 26,
            height: 26,
            borderRadius: 7,
            background: colors.accent,
            color: "var(--accent-contrast)",
            fontSize: 14,
          }}
        >
          ◉
        </span>
        Mission Control
      </Link>

      <nav style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                textDecoration: "none",
                color: active ? colors.foregroundStrong : colors.muted,
                background: active ? colors.cardHover : "transparent",
                borderLeft: active
                  ? `2px solid ${colors.accent}`
                  : "2px solid transparent",
              }}
            >
              <span
                aria-hidden
                style={{ width: 16, textAlign: "center", color: active ? colors.accent : colors.muted }}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: 16 }}>
        <ThemeToggle />
      </div>
    </aside>
  );
}
