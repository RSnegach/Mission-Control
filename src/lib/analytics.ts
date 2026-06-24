import type { Call, Message } from "./types";

/**
 * Pure aggregation helpers over already-fetched arrays. These do not read the
 * backend; pages fetch the data and pass it in. Timezone-aware so buckets line
 * up with the business's local day.
 */

/** YYYY-MM-DD for an ISO timestamp in a timezone. */
export function dayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Hour-of-day 0-23 for an ISO timestamp in a timezone. */
export function hourOf(iso: string, tz: string): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).format(new Date(iso));
  // Intl can return "24" for midnight in some environments; normalize to 0.
  const n = Number.parseInt(h, 10);
  return n === 24 ? 0 : n;
}

/** True when an ISO timestamp falls on today's date in the timezone. */
export function isToday(iso: string, tz: string): boolean {
  return dayKey(iso, tz) === dayKey(new Date().toISOString(), tz);
}

/** Calls per hour for today, 24 buckets labeled 12a..11p. */
export function callsByHour(calls: Call[], tz: string): { label: string; value: number }[] {
  const buckets = new Array(24).fill(0);
  for (const c of calls) {
    if (!c.created_at || !isToday(c.created_at, tz)) continue;
    buckets[hourOf(c.created_at, tz)] += 1;
  }
  return buckets.map((value, h) => ({ label: hourLabel(h), value }));
}

/** Calls per day for the last `days` days (oldest first), labeled e.g. "Mon 23". */
export function callsByDay(
  calls: Call[],
  tz: string,
  days = 7,
): { label: string; value: number }[] {
  const out: { key: string; label: string; value: number }[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    const iso = d.toISOString();
    out.push({ key: dayKey(iso, tz), label: dayLabel(iso, tz), value: 0 });
  }
  const index = new Map(out.map((o, i) => [o.key, i]));
  for (const c of calls) {
    if (!c.created_at) continue;
    const i = index.get(dayKey(c.created_at, tz));
    if (i !== undefined) out[i].value += 1;
  }
  return out.map(({ label, value }) => ({ label, value }));
}

/** Answered vs missed counts for today, with chart colors. */
export function answeredVsMissed(
  calls: Call[],
  tz: string,
): { name: string; value: number; color: string }[] {
  let answered = 0;
  let missed = 0;
  for (const c of calls) {
    if (!c.created_at || !isToday(c.created_at, tz)) continue;
    if (c.status === "answered") answered += 1;
    else if (c.status === "missed") missed += 1;
  }
  return [
    { name: "Answered", value: answered, color: "#22c55e" },
    { name: "Missed", value: missed, color: "#ef4444" },
  ];
}

/** Group messages by request and by contact (for expandable rows and profiles). */
export function groupMessages(messages: Message[]): {
  byRequest: Map<string, Message[]>;
  byContact: Map<string, Message[]>;
} {
  const byRequest = new Map<string, Message[]>();
  const byContact = new Map<string, Message[]>();
  // Oldest first within each group so threads read top to bottom.
  const asc = messages
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const m of asc) {
    if (m.request_id) push(byRequest, m.request_id, m);
    if (m.contact_id) push(byContact, m.contact_id, m);
  }
  return { byRequest, byContact };
}

function push(map: Map<string, Message[]>, key: string, m: Message): void {
  const arr = map.get(key);
  if (arr) arr.push(m);
  else map.set(key, [m]);
}

function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function dayLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
  }).format(new Date(iso));
}
