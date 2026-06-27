"use client";

import Link from "next/link";
import type { KpiDelta } from "@/lib/analytics";
import Sparkline from "./charts/Sparkline";
import { card, colors } from "./ui";

export type ThresholdTone = "danger" | "warning";

/**
 * A metric tile: label, large value, optional prior-period delta, sparkline,
 * threshold tint, and drill-down link. Presentational; all numbers are computed
 * by the caller.
 */
export function StatCard({
  label,
  value,
  accent,
  hint,
  delta,
  deltaGoodWhenDown,
  sparkline,
  sparklineColor,
  thresholdTone,
  href,
  loading,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
  delta?: KpiDelta;
  deltaGoodWhenDown?: boolean; // e.g. Missed: fewer is better
  sparkline?: number[];
  sparklineColor?: string;
  thresholdTone?: ThresholdTone;
  href?: string;
  loading?: boolean;
}) {
  const tone =
    thresholdTone === "danger"
      ? colors.danger
      : thresholdTone === "warning"
        ? colors.warning
        : null;

  const cardStyle: React.CSSProperties = {
    ...card,
    padding: "16px 18px",
    position: "relative",
    height: "100%",
    boxSizing: "border-box",
    ...(tone
      ? { borderColor: tone, background: `color-mix(in srgb, ${tone} 8%, var(--card))` }
      : null),
    ...(href ? { cursor: "pointer" } : null),
  };

  const inner = loading ? (
    <>
      <div style={{ color: colors.muted, fontSize: 13 }}>{label}</div>
      <div className="mc-skeleton" style={{ width: 64, height: 30, marginTop: 6, borderRadius: 6 }} />
    </>
  ) : (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ color: colors.muted, fontSize: 13 }}>{label}</span>
        {delta ? <DeltaBadge delta={delta} goodWhenDown={deltaGoodWhenDown} /> : null}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: accent ?? colors.foreground, lineHeight: 1.1 }}>
          {value}
        </span>
        {sparkline && sparkline.length > 0 ? (
          <Sparkline data={sparkline} color={sparklineColor ?? accent} width={92} height={26} />
        ) : null}
      </div>
      {hint ? <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{hint}</div> : null}
    </>
  );

  if (href && !loading) {
    return (
      <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
        <div style={cardStyle}>{inner}</div>
      </Link>
    );
  }
  return <div style={cardStyle}>{inner}</div>;
}

function DeltaBadge({ delta, goodWhenDown }: { delta: KpiDelta; goodWhenDown?: boolean }) {
  if (delta.direction === "flat" || delta.pct === null) {
    return <span style={{ fontSize: 12, color: colors.muted }}>—</span>;
  }
  const up = delta.direction === "up";
  // "Good" is green. For most metrics up is good; for missed-type, down is good.
  const good = goodWhenDown ? !up : up;
  const color = good ? colors.success : colors.danger;
  const arrow = up ? "▲" : "▼";
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, whiteSpace: "nowrap" }}>
      {arrow} {Math.abs(delta.pct)}%
    </span>
  );
}

/** Responsive grid wrapper for a set of StatCards. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}
