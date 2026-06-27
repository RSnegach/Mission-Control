"use client";

import type { RecoveryFunnelResult } from "@/lib/analytics";
import { colors } from "../ui";

/**
 * Missed-call recovery funnel: missed -> texted back -> replied. Bar widths are
 * proportional to the missed count so the drop-off at each stage is visible.
 */
export default function RecoveryFunnel({ funnel }: { funnel: RecoveryFunnelResult }) {
  if (funnel.missed === 0) {
    return (
      <div style={{ height: 200, display: "grid", placeItems: "center", color: colors.muted, fontSize: 13 }}>
        No missed calls in range.
      </div>
    );
  }

  const stages = [
    { label: "Missed calls", value: funnel.missed, color: colors.danger },
    { label: "Texted back", value: funnel.followedUp, color: colors.warning },
    { label: "Replied", value: funnel.replied, color: colors.success },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0" }}>
      {stages.map((s) => {
        const pct = funnel.missed > 0 ? (s.value / funnel.missed) * 100 : 0;
        return (
          <div key={s.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: colors.muted }}>{s.label}</span>
              <span style={{ fontWeight: 600 }}>
                {s.value}
                <span style={{ color: colors.muted, fontWeight: 400 }}> ({Math.round(pct)}%)</span>
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 6, background: colors.border, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: s.color, borderRadius: 6 }} />
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
        Reply rate:{" "}
        <span style={{ color: colors.foreground, fontWeight: 600 }}>
          {funnel.replyRate === null ? "—" : `${funnel.replyRate}%`}
        </span>{" "}
        of texted-back callers replied
      </div>
    </div>
  );
}
