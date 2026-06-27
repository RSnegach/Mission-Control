"use client";

import { useState } from "react";
import { colors } from "./ui";

export interface DashAlert {
  id: string;
  tone: "danger" | "warning";
  text: string;
}

/** Dismissible banner shown above the KPIs when thresholds breach. */
export default function AlertBanner({ alerts }: { alerts: DashAlert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
      {visible.map((a) => {
        const tone = a.tone === "danger" ? colors.danger : colors.warning;
        return (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${tone}55`,
              background: `color-mix(in srgb, ${tone} 12%, var(--card))`,
              fontSize: 14,
            }}
          >
            <span style={{ color: colors.foreground }}>
              <span aria-hidden style={{ color: tone, marginRight: 8 }}>⚠</span>
              {a.text}
            </span>
            <button
              onClick={() => setDismissed((p) => new Set(p).add(a.id))}
              aria-label="Dismiss"
              style={{
                border: "none",
                background: "transparent",
                color: colors.muted,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
