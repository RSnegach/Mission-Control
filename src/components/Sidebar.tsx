"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { colors } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calls", label: "Calls" },
  { href: "/clients", label: "Clients" },
  { href: "/requests", label: "Requests" },
  { href: "/messages", label: "Messages" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border}`,
        padding: "24px 16px",
        minHeight: "100vh",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
      }}
    >
      <Link
        href="/"
        style={{
          display: "block",
          fontSize: 16,
          fontWeight: 700,
          color: colors.foreground,
          textDecoration: "none",
          padding: "0 8px 20px",
        }}
      >
        Mission Control
      </Link>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map((item) => {
          // Active when the path matches or is a sub-route (e.g. /clients/123).
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                textDecoration: "none",
                color: active ? colors.foreground : colors.muted,
                background: active ? "var(--accent)" : "transparent",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
