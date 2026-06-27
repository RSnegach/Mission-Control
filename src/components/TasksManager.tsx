"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { addTask, changeTask } from "@/app/(app)/ops-actions";
import { PriorityBadge } from "./Badge";
import { colors, card } from "./ui";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

/** Owner to-do queue: create tasks, complete them, see overdue. */
export function TasksManager({ tasks, timezone }: { tasks: Task[]; timezone: string }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("normal");
  const [, start] = useTransition();
  const now = Date.now();

  function create() {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    start(() => addTask({ title: t, priority }));
  }
  function toggle(task: Task) {
    start(() => changeTask(task.id, { status: task.status === "done" ? "open" : "done" }));
  }

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div>
      <div style={{ ...card, padding: "14px 16px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          placeholder="Add a task (e.g. Call John back about the quote)"
          style={{ flex: "2 1 280px", padding: "9px 12px", borderRadius: 8, fontSize: 14, background: colors.background, border: `1px solid ${colors.border}`, color: colors.foreground, outline: "none" }}
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ padding: "8px", borderRadius: 8, fontSize: 13, background: colors.card, border: `1px solid ${colors.border}`, color: colors.foreground }}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={create} disabled={!title.trim()} style={{ padding: "9px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", background: "var(--accent)", color: "var(--accent-contrast)" }}>Add task</button>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <p style={{ color: colors.muted }}>No tasks yet. Add one above.</p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {open.map((t) => {
          const overdue = t.due_at ? new Date(t.due_at).getTime() < now : false;
          return (
            <div key={t.id} style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <input type="checkbox" checked={false} onChange={() => toggle(t)} style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
              <span style={{ flex: 1, fontSize: 14 }}>{t.title}</span>
              {t.due_at ? (
                <span style={{ fontSize: 12, color: overdue ? colors.danger : colors.muted }}>
                  {formatTime(t.due_at, timezone)}{overdue ? " · overdue" : ""}
                </span>
              ) : null}
              <PriorityBadge priority={t.priority} />
            </div>
          );
        })}
      </div>

      {done.length > 0 ? (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.muted, marginBottom: 8 }}>Completed ({done.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {done.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px" }}>
                <input type="checkbox" checked readOnly onClick={() => toggle(t)} style={{ accentColor: "var(--accent)", width: 16, height: 16, cursor: "pointer" }} />
                <span style={{ flex: 1, fontSize: 14, color: colors.muted, textDecoration: "line-through" }}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
