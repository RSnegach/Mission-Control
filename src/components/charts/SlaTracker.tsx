"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CallRequest } from "@/lib/types";
import { slaBuckets, type SlaBucket } from "@/lib/analytics";
import { colors, card } from "../ui";

const TONE: Record<SlaBucket, string> = {
  overdue: colors.danger,
  dueSoon: colors.warning,
  onTrack: colors.success,
};
const LABEL: Record<SlaBucket, string> = {
  overdue: "Overdue",
  dueSoon: "Due soon",
  onTrack: "On track",
};

/** Live callback SLA tracker: buckets open requests by urgency, ticking each second. */
export default function SlaTracker({
  requests,
  slaMinutes,
}: {
  requests: CallRequest[];
  slaMinutes: number;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { counts, items } = slaBuckets(requests, now, slaMinutes);
  const open = items.length;

  if (open === 0) {
    return (
      <div style={{ ...card, padding: "16px 18px" }}>
        <div style={{ color: colors.muted, fontSize: 13, marginBottom: 6 }}>Callback SLA</div>
        <div style={{ color: colors.muted, fontSize: 14 }}>No open callbacks. All clear.</div>
      </div>
    );
  }

  const order: SlaBucket[] = ["overdue", "dueSoon", "onTrack"];

  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={{ color: colors.muted, fontSize: 13 }}>Callback SLA</span>
        <Link href="/requests" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 12 }}>
          View all
        </Link>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {order.map((b) => (
          <Link
            key={b}
            href={`/requests?bucket=${b}`}
            style={{
              flex: 1,
              textDecoration: "none",
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${TONE[b]}55`,
              background: `color-mix(in srgb, ${TONE[b]} 10%, var(--card))`,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: TONE[b] }}>{counts[b]}</div>
            <div style={{ fontSize: 12, color: colors.muted }}>{LABEL[b]}</div>
          </Link>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.slice(0, 5).map(({ request, remainingMs, bucket }) => (
          <div key={request.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: colors.foreground, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {request.title}
            </span>
            <span style={{ color: TONE[bucket], fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {fmt(remainingMs)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Human time remaining (or overdue). Under an hour ticks as mm:ss; longer spans
 * scale to "Hh Mm" then "Dd Hh" so a callback overdue by days reads sensibly.
 */
function fmt(ms: number): string {
  const overdue = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  let body: string;
  if (days > 0) body = `${days}d ${hours}h`;
  else if (hours > 0) body = `${hours}h ${mins}m`;
  else body = `${mins}:${String(secs).padStart(2, "0")}`;

  return overdue ? `${body} over` : body;
}
