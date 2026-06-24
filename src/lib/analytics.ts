import type { Call, CallRequest, Message } from "./types";

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
    { name: "Answered", value: answered, color: "#34d399" },
    { name: "Missed", value: missed, color: "#f87171" },
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

// ===========================================================================
// Adjustable-range, multi-metric trend series
// ===========================================================================

export type RangePreset = "week" | "month" | "year" | "custom";
export interface TimeRange {
  preset: RangePreset;
  start?: string; // YYYY-MM-DD, custom only
  end?: string; // YYYY-MM-DD, custom only
}
export type Bucket = "day" | "week" | "month";
export interface ResolvedRange {
  startMs: number;
  endMs: number;
  bucket: Bucket;
  buckets: { key: string; label: string; startMs: number; endMs: number }[];
}

const DAY_MS = 86_400_000;

function monthKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" })
    .format(new Date(iso))
    .slice(0, 7); // YYYY-MM
}
function monthLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", year: "2-digit" }).format(
    new Date(iso),
  );
}

/** Resolve a TimeRange into aligned buckets (oldest first). */
export function resolveRange(range: TimeRange, tz: string, now = Date.now()): ResolvedRange {
  let startMs: number;
  let endMs = now;
  let bucket: Bucket;

  if (range.preset === "custom" && range.start && range.end) {
    startMs = new Date(`${range.start}T00:00:00`).getTime();
    endMs = new Date(`${range.end}T23:59:59`).getTime();
    const span = endMs - startMs;
    bucket = span <= 31 * DAY_MS ? "day" : span <= 180 * DAY_MS ? "week" : "month";
  } else if (range.preset === "year") {
    startMs = now - 365 * DAY_MS;
    bucket = "month";
  } else if (range.preset === "month") {
    startMs = now - 30 * DAY_MS;
    bucket = "day";
  } else {
    startMs = now - 6 * DAY_MS; // week = last 7 days inclusive
    bucket = "day";
  }

  const buckets: ResolvedRange["buckets"] = [];
  if (bucket === "day") {
    // Walk each day from startMs to endMs.
    for (let t = startMs; t <= endMs; t += DAY_MS) {
      const iso = new Date(t).toISOString();
      buckets.push({
        key: dayKey(iso, tz),
        label: dayLabel(iso, tz),
        startMs: t,
        endMs: t + DAY_MS,
      });
    }
  } else if (bucket === "month") {
    // Walk calendar months.
    const seen = new Set<string>();
    for (let t = startMs; t <= endMs; t += DAY_MS) {
      const iso = new Date(t).toISOString();
      const key = monthKey(iso, tz);
      if (seen.has(key)) continue;
      seen.add(key);
      buckets.push({ key, label: monthLabel(iso, tz), startMs: t, endMs: t }); // bounds unused for month
    }
  } else {
    // Weekly buckets of 7 days from startMs.
    let i = 0;
    for (let t = startMs; t <= endMs; t += 7 * DAY_MS, i++) {
      const iso = new Date(t).toISOString();
      buckets.push({
        key: `w${i}`,
        label: new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(
          new Date(iso),
        ),
        startMs: t,
        endMs: t + 7 * DAY_MS,
      });
    }
  }

  return { startMs, endMs, bucket, buckets };
}

/** Index of the bucket an ISO timestamp falls into, or -1 if outside. */
export function bucketIndexFor(iso: string, r: ResolvedRange, tz: string): number {
  if (r.bucket === "day") {
    const k = dayKey(iso, tz);
    return r.buckets.findIndex((b) => b.key === k);
  }
  if (r.bucket === "month") {
    const k = monthKey(iso, tz);
    return r.buckets.findIndex((b) => b.key === k);
  }
  const t = new Date(iso).getTime();
  return r.buckets.findIndex((b) => t >= b.startMs && t < b.endMs);
}

export type MetricKey =
  | "calls"
  | "answered"
  | "missed"
  | "missedResponded"
  | "newCallers"
  | "returningCallers"
  | "followupsSent"
  | "repliesReceived"
  | "answerRate";

export interface MetricDef {
  key: MetricKey;
  label: string;
  color: string;
  unit?: "percent";
}

export const METRICS: MetricDef[] = [
  { key: "calls", label: "Total calls", color: "#4f7dff" },
  { key: "answered", label: "Answered", color: "#34d399" },
  { key: "missed", label: "Missed", color: "#f87171" },
  { key: "missedResponded", label: "Missed responded to", color: "#fbbf24" },
  { key: "newCallers", label: "New callers", color: "#a78bfa" },
  { key: "returningCallers", label: "Returning callers", color: "#22d3ee" },
  { key: "followupsSent", label: "Follow-ups sent", color: "#f472b6" },
  { key: "repliesReceived", label: "Replies received", color: "#60a5fa" },
  { key: "answerRate", label: "Answer rate %", color: "#10b981", unit: "percent" },
];

export const DEFAULT_METRICS: MetricKey[] = ["calls", "missed", "missedResponded"];

export interface SeriesInput {
  calls: Call[];
  messages: Message[];
  requests?: CallRequest[];
}

/** Per-bucket values for the selected metrics, ready to feed Recharts. */
export function computeMetricSeries(
  input: SeriesInput,
  metrics: MetricKey[],
  r: ResolvedRange,
  tz: string,
): Array<Record<string, number | string>> {
  const n = r.buckets.length;
  const zero = () => new Array(n).fill(0);
  const acc: Record<MetricKey, number[]> = {
    calls: zero(),
    answered: zero(),
    missed: zero(),
    missedResponded: zero(),
    newCallers: zero(),
    returningCallers: zero(),
    followupsSent: zero(),
    repliesReceived: zero(),
    answerRate: zero(),
  };

  const callTime = (c: Call) => c.created_at ?? c.started_at ?? null;

  // Request ids that have any message (for "missed responded to").
  const respondedRequests = new Set<string>();
  for (const m of input.messages) {
    if (m.request_id) respondedRequests.add(m.request_id);
  }

  // First-ever call time per contact (for new vs returning).
  const firstCallMs = new Map<string, number>();
  for (const c of input.calls) {
    const t = callTime(c);
    if (!c.contact_id || !t) continue;
    const ms = new Date(t).getTime();
    const prev = firstCallMs.get(c.contact_id);
    if (prev === undefined || ms < prev) firstCallMs.set(c.contact_id, ms);
  }

  for (const c of input.calls) {
    const t = callTime(c);
    if (!t) continue;
    const i = bucketIndexFor(t, r, tz);
    if (i < 0) continue;
    acc.calls[i] += 1;
    if (c.status === "answered") acc.answered[i] += 1;
    if (c.status === "missed") {
      acc.missed[i] += 1;
      if (c.created_request_id && respondedRequests.has(c.created_request_id)) {
        acc.missedResponded[i] += 1;
      }
    }
    if (c.contact_id) {
      const callMs = new Date(t).getTime();
      const first = firstCallMs.get(c.contact_id);
      if (first !== undefined && callMs === first) acc.newCallers[i] += 1;
      else if (first !== undefined && callMs > first) acc.returningCallers[i] += 1;
    }
  }

  for (const m of input.messages) {
    const i = bucketIndexFor(m.created_at, r, tz);
    if (i < 0) continue;
    if (m.direction === "outbound") acc.followupsSent[i] += 1;
    else acc.repliesReceived[i] += 1;
  }

  for (let i = 0; i < n; i++) {
    const a = acc.answered[i];
    const m = acc.missed[i];
    acc.answerRate[i] = a + m > 0 ? Math.round((a / (a + m)) * 100) : 0;
  }

  return r.buckets.map((b, i) => {
    const row: Record<string, number | string> = { label: b.label };
    for (const key of metrics) row[key] = acc[key][i];
    return row;
  });
}
