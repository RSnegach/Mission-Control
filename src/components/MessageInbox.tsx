"use client";

import { useMemo, useState } from "react";
import type { Message } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { MessageThread } from "./MessageThread";
import { EditableName } from "./EditableName";
import { colors, card } from "./ui";

export interface ThreadView {
  contactId: string;
  name: string; // display fallback (name or phone or "Unknown caller")
  contactName: string | null; // the editable contact name (null = unnamed)
  phone: string | null;
  msgs: Message[];
  last: Message;
  hasReply: boolean;
  hasOutbound: boolean;
}

type MsgFilter = "all" | "inbound" | "outbound" | "unanswered";

const FILTERS: { key: MsgFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "inbound", label: "Replied" },
  { key: "outbound", label: "We texted" },
  { key: "unanswered", label: "Awaiting reply" },
];

/** Searchable, filterable SMS inbox. Thread view models are built server-side. */
export function MessageInbox({
  threads,
  timezone,
}: {
  threads: ThreadView[];
  timezone: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MsgFilter>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter === "inbound" && !t.hasReply) return false;
      if (filter === "outbound" && !t.hasOutbound) return false;
      if (filter === "unanswered" && !(t.hasOutbound && !t.hasReply)) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.phone ?? ""} ${t.msgs.map((m) => m.body).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [threads, query, filter]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${colors.border}`,
                background: filter === f.key ? "var(--accent)" : "transparent",
                color: filter === f.key ? "#fff" : colors.muted,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, number, or message text"
          style={{
            flex: "1 1 260px",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            color: colors.foreground,
            outline: "none",
          }}
        />
        <span style={{ color: colors.muted, fontSize: 12 }}>
          {rows.length} of {threads.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: colors.muted }}>No conversations match.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {rows.map((t) => (
            <div key={t.contactId} style={{ ...card, padding: "16px 18px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 12,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600 }}>
                  <EditableName
                    contactId={t.contactId}
                    name={t.contactName}
                    href={`/clients/${t.contactId}`}
                  />
                  {t.phone ? (
                    <span style={{ color: colors.muted, fontSize: 12, fontWeight: 400 }}>{t.phone}</span>
                  ) : null}
                </span>
                <span style={{ color: colors.muted, fontSize: 12 }}>
                  {formatTime(t.last.created_at, timezone)}
                </span>
              </div>
              <MessageThread messages={t.msgs} timezone={timezone} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
