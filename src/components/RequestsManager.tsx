"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { CallRequest } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { changeRequest, addRequest, scheduleCallback, bulkUpdateRequestStatus } from "@/app/(app)/ops-actions";
import { RequestStatusBadge, PriorityBadge } from "./Badge";
import { Table, Th, Td } from "./Table";
import { colors, card, rowBorder } from "./ui";

export interface RequestRow {
  request: CallRequest;
  clientName: string;
  clientId: string | null;
}

const STATUSES = ["needs_callback", "in_progress", "completed", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = {
  needs_callback: "Needs callback",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const BOARD_COLUMNS = ["needs_callback", "in_progress", "completed"] as const;

export function RequestsManager({ rows, timezone }: { rows: RequestRow[]; timezone: string }) {
  const [view, setView] = useState<"table" | "board">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNew, setShowNew] = useState(false);
  const [, start] = useTransition();

  function toggleSel(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function setStatus(id: string, status: string) {
    start(() => changeRequest(id, { status }));
  }
  function setPriority(id: string, priority: string) {
    start(() => changeRequest(id, { priority }));
  }
  function setSchedule(id: string, localValue: string) {
    if (!localValue) return;
    const iso = new Date(localValue).toISOString();
    start(() => scheduleCallback(id, iso));
  }
  function bulkDone() {
    const ids = [...selected];
    setSelected(new Set());
    start(() => bulkUpdateRequestStatus(ids, "completed"));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["table", "board"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={pill(view === v)}>
              {v === "table" ? "List" : "Board"}
            </button>
          ))}
        </div>
        <button onClick={() => setShowNew((s) => !s)} style={accentBtn}>
          + New request
        </button>
        {selected.size > 0 ? (
          <button onClick={bulkDone} style={pill(false)}>
            Mark {selected.size} done
          </button>
        ) : null}
        <span style={{ color: colors.muted, fontSize: 12, marginLeft: "auto" }}>{rows.length} total</span>
      </div>

      {showNew ? <NewRequestForm rows={rows} onDone={() => setShowNew(false)} /> : null}

      {view === "table" ? (
        <Table>
          <thead>
            <tr>
              <Th></Th>
              <Th>Title</Th>
              <Th>Client</Th>
              <Th>Status</Th>
              <Th>Priority</Th>
              <Th>Schedule</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "16px 12px", color: colors.muted }}>No requests.</td></tr>
            ) : rows.map(({ request: r, clientName, clientId }) => (
              <tr key={r.id} style={rowBorder}>
                <Td>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} style={{ accentColor: "var(--accent)" }} />
                </Td>
                <Td>{r.title}</Td>
                <Td>
                  {clientId ? (
                    <Link href={`/clients/${clientId}`} style={{ color: "var(--accent)", textDecoration: "none" }}>{clientName}</Link>
                  ) : <span style={{ color: colors.muted }}>{clientName}</span>}
                </Td>
                <Td>
                  <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} style={selectStyle}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </Td>
                <Td>
                  <select value={r.priority} onChange={(e) => setPriority(r.id, e.target.value)} style={selectStyle}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Td>
                <Td>
                  {r.scheduled_for ? (
                    <span style={{ fontSize: 12, color: colors.foreground }}>{formatTime(r.scheduled_for, timezone)}</span>
                  ) : (
                    <input
                      type="datetime-local"
                      onChange={(e) => setSchedule(r.id, e.target.value)}
                      style={{ ...selectStyle, fontSize: 12 }}
                    />
                  )}
                </Td>
                <Td>{formatTime(r.created_at, timezone)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Board rows={rows} onDrop={setStatus} />
      )}
    </div>
  );
}

function Board({ rows, onDrop }: { rows: RequestRow[]; onDrop: (id: string, status: string) => void }) {
  const byCol = useMemo(() => {
    const m: Record<string, RequestRow[]> = { needs_callback: [], in_progress: [], completed: [] };
    for (const row of rows) {
      const col = (BOARD_COLUMNS as readonly string[]).includes(row.request.status) ? row.request.status : null;
      if (col) m[col].push(row);
    }
    return m;
  }, [rows]);

  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", overflowX: "auto" }}>
      {BOARD_COLUMNS.map((col) => (
        <div
          key={col}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => { if (dragId) { onDrop(dragId, col); setDragId(null); } }}
          style={{ flex: "1 1 240px", minWidth: 240, ...card, padding: 12, background: colors.surface }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.muted, marginBottom: 10 }}>
            {STATUS_LABEL[col]} <span style={{ color: colors.muted }}>({byCol[col].length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
            {byCol[col].map(({ request: r, clientName }) => (
              <div
                key={r.id}
                draggable
                onDragStart={() => setDragId(r.id)}
                onDragEnd={() => setDragId(null)}
                style={{ ...card, padding: "10px 12px", cursor: "grab", opacity: dragId === r.id ? 0.5 : 1 }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>{r.title}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: colors.muted }}>{clientName}</span>
                  <PriorityBadge priority={r.priority} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NewRequestForm({ rows, onDone }: { rows: RequestRow[]; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [, start] = useTransition();

  // Unique clients from the rows for the picker.
  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.clientId && !seen.has(r.clientId)) seen.set(r.clientId, r.clientName);
    return [...seen.entries()];
  }, [rows]);

  function submit() {
    const t = title.trim();
    if (!t) return;
    start(() => addRequest({ contactId: contactId || null, title: t, priority }));
    onDone();
  }

  return (
    <div style={{ ...card, padding: "16px 18px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" style={{ ...inputStyle, flex: "2 1 240px" }} />
      <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={{ ...selectStyle, flex: "1 1 160px" }}>
        <option value="">No client</option>
        {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <select value={priority} onChange={(e) => setPriority(e.target.value)} style={selectStyle}>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button onClick={submit} disabled={!title.trim()} style={accentBtn}>Create</button>
      <button onClick={onDone} style={pill(false)}>Cancel</button>
    </div>
  );
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${colors.border}`,
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : colors.muted,
  };
}
const accentBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
  border: "none", background: "var(--accent)", color: "var(--accent-contrast)",
};
const selectStyle: React.CSSProperties = {
  padding: "6px 8px", borderRadius: 8, fontSize: 13,
  background: colors.card, border: `1px solid ${colors.border}`, color: colors.foreground, outline: "none",
};
const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, fontSize: 14,
  background: colors.background, border: `1px solid ${colors.border}`, color: colors.foreground, outline: "none",
};
