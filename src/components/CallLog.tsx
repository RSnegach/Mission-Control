"use client";

import { useMemo, useState } from "react";
import { Table, Th } from "./Table";
import { CallRow, type CallView } from "./CallRow";
import { colors } from "./ui";

type StatusFilter = "all" | "answered" | "missed";

/** Filterable, searchable call log of expandable rows. Data is pre-enriched server-side. */
export function CallLog({ views, timezone }: { views: CallView[]; timezone: string }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return views.filter((v) => {
      if (status === "answered" && v.call.status !== "answered") return false;
      if (status === "missed" && v.call.status !== "missed") return false;
      if (!q) return true;
      const hay = `${v.contact?.name ?? ""} ${v.call.from_number ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [views, status, query]);

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
