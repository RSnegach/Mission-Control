import type { Call } from "@/lib/types";
import { formatTime, formatDuration } from "@/lib/format";
import { colors } from "./ui";

/** Compact started -> answered -> ended timeline for a call. */
export function CallTimeline({ call, timezone }: { call: Call; timezone: string }) {
  const steps: { label: string; value: string }[] = [
    { label: "Started", value: formatTime(call.started_at, timezone) },
  ];
  if (call.answered_at) {
    steps.push({ label: "Answered", value: formatTime(call.answered_at, timezone) });
  }
  steps.push({ label: "Ended", value: formatTime(call.ended_at, timezone) });
  if (call.duration_seconds !== null) {
    steps.push({ label: "Duration", value: formatDuration(call.duration_seconds) });
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
      {steps.map((s) => (
        <div key={s.label}>
          <div style={{ color: colors.muted, fontSize: 11 }}>{s.label}</div>
          <div style={{ fontSize: 13 }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}
