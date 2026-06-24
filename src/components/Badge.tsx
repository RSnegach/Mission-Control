import { statusBadge } from "@/lib/format";
import type { Call } from "@/lib/types";

/** Generic pill. Color tints both text and a translucent background. */
export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color,
        // Mix the status color into the page surface so the tint reads cleanly
        // in both light and dark themes instead of a flat alpha overlay.
        background: `color-mix(in srgb, ${color} 14%, var(--surface))`,
        border: `1px solid color-mix(in srgb, ${color} 35%, var(--surface))`,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
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
