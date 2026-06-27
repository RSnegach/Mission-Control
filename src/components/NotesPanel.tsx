"use client";

import { useState, useTransition } from "react";
import type { Activity } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { addNote } from "@/app/(app)/ops-actions";
import { colors, card } from "./ui";

const KIND_LABEL: Record<string, string> = {
  note: "Note",
  status_change: "Status",
  message_sent: "Text sent",
  created: "Created",
};

/** Add internal notes and show the activity timeline for a contact or request. */
export function NotesPanel({
  contactId,
  activity,
  timezone,
}: {
  contactId?: string;
  requestId?: string;
  activity: Activity[];
  timezone: string;
}) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function save() {
    const body = text.trim();
    if (!body) return;
    setText("");
    start(() => addNote({ contactId }, body));
  }

  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="Add an internal note..."
          disabled={pending}
          style={{
            flex: 1, padding: "9px 12px", borderRadius: 8, fontSize: 14,
            background: colors.background, border: `1px solid ${colors.border}`, color: colors.foreground, outline: "none",
          }}
        />
        <button onClick={save} disabled={pending || !text.trim()} style={{
          padding: "9px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
          border: "none", background: "var(--accent)", color: "var(--accent-contrast)", opacity: pending || !text.trim() ? 0.6 : 1,
        }}>Add</button>
      </div>

      {activity.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>No activity yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activity.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: colors.muted, minWidth: 64,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>{KIND_LABEL[a.kind] ?? a.kind}</span>
              <span style={{ flex: 1, fontSize: 14, color: colors.foreground }}>{a.body}</span>
              <span style={{ fontSize: 11, color: colors.muted, whiteSpace: "nowrap" }}>{formatTime(a.created_at, timezone)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
