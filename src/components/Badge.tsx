import { statusBadge } from "@/lib/format";
import type { Call } from "@/lib/types";

/** Generic pill. Color tints both text and a translucent background. */
export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: `${color}22`, // ~13% alpha tint
        border: `1px solid ${color}55`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/** Call status pill, reusing the existing color mapping. */
export function CallStatusBadge({ call }: { call: Call }) {
  const { label, color } = statusBadge(call);
  return <Badge label={label} color={color} />;
}

const REQUEST_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "#9aa4b2" },
  needs_callback: { label: "Needs callback", color: "#eab308" },
  scheduled: { label: "Scheduled", color: "#3b82f6" },
  in_progress: { label: "In progress", color: "#3b82f6" },
  waiting: { label: "Waiting", color: "#9aa4b2" },
  closed: { label: "Closed", color: "#22c55e" },
};

export function RequestStatusBadge({ status }: { status: string }) {
  const m = REQUEST_STATUS[status] ?? { label: status, color: "#9aa4b2" };
  return <Badge label={m.label} color={m.color} />;
}

const PRIORITY: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "#9aa4b2" },
  normal: { label: "Normal", color: "#3b82f6" },
  high: { label: "High", color: "#eab308" },
  urgent: { label: "Urgent", color: "#ef4444" },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const m = PRIORITY[priority] ?? { label: priority, color: "#9aa4b2" };
  return <Badge label={m.label} color={m.color} />;
}
