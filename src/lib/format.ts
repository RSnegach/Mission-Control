import type { Call } from "./types";

/** Format an ISO timestamp in a business timezone, time-of-day + short date. */
export function formatTime(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

/** Seconds -> m:ss, or em-free dash when absent. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Display label + color for a call status. */
export function statusBadge(call: Call): { label: string; color: string } {
  switch (call.status) {
    case "incoming":
      return { label: "Incoming", color: "#9aa4b2" };
    case "routing":
      return { label: "Ringing", color: "#eab308" };
    case "answered":
      return { label: "Answered", color: "#22c55e" };
    case "missed":
      return { label: "Missed", color: "#ef4444" };
    default:
      return { label: call.status, color: "#9aa4b2" };
  }
}
