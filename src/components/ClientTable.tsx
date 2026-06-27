"use client";

import { useMemo, useState } from "react";
import { Table, Th } from "./Table";
import { EditableName } from "./EditableName";
import { formatTime } from "@/lib/format";
import { colors, rowBorder } from "./ui";

/** One client (contact) enriched with interaction history, assembled server-side. */
export interface ClientView {
  id: string;
  name: string | null;
  phone: string | null;
  callCount: number;
  messageCount: number;
  openRequests: number;
  lastInteractionAt: string | null; // max of last call / last message
  firstSeenAt: string;
  tags: string[];
}

type SortKey = "recent" | "name" | "calls" | "messages";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "name", label: "Name" },
  { key: "calls", label: "Calls" },
  { key: "messages", label: "Messages" },
];

export function ClientTable({
  clients,
  timezone,
}: {
  clients: ClientView[];
  timezone: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  // Local name overrides so an inline rename updates search/sort without a reload.
  const [names, setNames] = useState<Record<string, string | null>>({});

  const effectiveName = (c: ClientView) =>
    c.id in names ? names[c.id] : c.name;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withNames = clients.map((c) => ({ ...c, name: effectiveName(c) }));
    const filtered = q
      ? withNames.filter((c) =>
          `${c.name ?? ""} ${c.phone ?? ""} ${c.tags.join(" ")}`.toLowerCase().includes(q),
        )
      : withNames.slice();

    filtered.sort((a, b) => {
      switch (sort) {
        case "name":
          return (a.name || "Unnamed caller").localeCompare(b.name || "Unnamed caller");
        case "calls":
          return b.callCount - a.callCount;
        case "messages":
          return b.messageCount - a.messageCount;
        case "recent":
        default:
          // Newest interaction first; nulls last.
          return (b.lastInteractionAt ?? "").localeCompare(a.lastInteractionAt ?? "");
      }
    });
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, query, sort, names]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients by name or number"
          style={{
            flex: "1 1 240px",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            color: colors.foreground,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ color: colors.muted, fontSize: 12, marginRight: 4 }}>Sort</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${colors.border}`,
                background: sort === s.key ? "var(--accent)" : "transparent",
                color: sort === s.key ? "#fff" : colors.muted,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span style={{ color: colors.muted, fontSize: 12 }}>
          {rows.length} of {clients.length}
        </span>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Phone</Th>
            <Th align="right">Calls</Th>
            <Th align="right">Messages</Th>
            <Th align="right">Open</Th>
            <Th>Last interaction</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "16px 12px", color: colors.muted, fontSize: 14 }}>
                No clients match.
              </td>
            </tr>
          ) : (
            rows.map((c) => (
              <tr key={c.id} style={rowBorder}>
                <td style={td}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <EditableName
                      contactId={c.id}
                      name={c.name}
                      href={`/clients/${c.id}`}
                      onSaved={(n) => setNames((prev) => ({ ...prev, [c.id]: n }))}
                    />
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "1px 7px",
                          borderRadius: 999,
                          color: "var(--accent)",
                          background: "color-mix(in srgb, var(--accent) 14%, var(--surface))",
                          border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--surface))",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                </td>
                <td style={{ ...td, color: colors.muted }}>{c.phone || "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{c.callCount}</td>
                <td style={{ ...td, textAlign: "right" }}>{c.messageCount}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  {c.openRequests > 0 ? (
                    <span style={{ color: "var(--warning)", fontWeight: 600 }}>{c.openRequests}</span>
                  ) : (
                    <span style={{ color: colors.muted }}>0</span>
                  )}
                </td>
                <td style={td}>
                  {c.lastInteractionAt ? formatTime(c.lastInteractionAt, timezone) : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}

const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };
