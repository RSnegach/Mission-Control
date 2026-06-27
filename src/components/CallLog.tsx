"use client";

import { useMemo, useState } from "react";
import { Table, Th } from "./Table";
import { CallRow, type CallView } from "./CallRow";
import { hourOf } from "@/lib/analytics";
import { colors } from "./ui";

type StatusFilter = "all" | "answered" | "missed";

/**
 * Filterable, searchable call log of expandable rows. Data is pre-enriched
 * server-side. initialStatus/initialHour seed the filters for drill-down from the
 * dashboard (e.g. /calls?status=missed or ?hour=14).
 */
export function CallLog({
  views,
  timezone,
  initialStatus = "all",
  initialHour = null,
}: {
  views: CallView[];
  timezone: string;
  initialStatus?: StatusFilter;
  initialHour?: number | null;
}) {
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [query, setQuery] = useState("");
  // Hour filter is drill-down-only (set via URL); cleared by the user with a chip.
  const [hour, setHour] = useState<number | null>(initialHour);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return views.filter((v) => {
      if (status === "answered" && v.call.status !== "answered") return false;
      if (status === "missed" && v.call.status !== "missed") return false;
      if (hour !== null) {
        const iso = v.call.created_at ?? v.call.started_at;
        if (!iso || hourOf(iso, timezone) !== hour) return false;
      }
      if (!q) return true;
      const hay = `${v.contact?.name ?? ""} ${v.call.from_number ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [views, status, query, hour, timezone]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "answered", "missed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                textTransform: "capitalize",
                cursor: "pointer",
                border: `1px solid ${colors.border}`,
                background: status === s ? "var(--accent)" : "transparent",
                color: status === s ? "#fff" : colors.muted,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search caller or number"
          style={{
            flex: "1 1 220px",
            padding: "7px 12px",
            borderRadius: 8,
            fontSize: 13,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            color: colors.foreground,
            outline: "none",
          }}
        />
        {hour !== null ? (
          <button
            onClick={() => setHour(null)}
            title="Clear hour filter"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: `1px solid var(--accent)`,
              background: "color-mix(in srgb, var(--accent) 14%, var(--card))",
              color: "var(--accent)",
            }}
          >
            {hourLabel(hour)} ✕
          </button>
        ) : null}
        <span style={{ color: colors.muted, fontSize: 12 }}>
          {filtered.length} of {views.length}
        </span>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Caller</Th>
            <Th>Status</Th>
            <Th>Text follow-up</Th>
            <Th>Routed to</Th>
            <Th>Time</Th>
            <Th>Duration</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "16px 12px", color: colors.muted, fontSize: 14 }}>
                No calls match.
              </td>
            </tr>
          ) : (
            filtered.map((v) => <CallRow key={v.call.id} view={v} timezone={timezone} />)
          )}
        </tbody>
      </Table>
    </div>
  );
}

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
