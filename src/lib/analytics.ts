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

/**
 * Calls per hour-of-day, 24 buckets labeled 12a..11p. Buckets every call passed
 * in; the caller pre-filters to the desired range (so over a multi-day range this
 * is a peak-hours histogram aggregated across days).
 */
export function callsByHour(calls: Call[], tz: string): { label: string; value: number }[] {
  const buckets = new Array(24).fill(0);
  for (const c of calls) {
    if (!c.created_at) continue;
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

/**
 * Answered vs missed counts with chart colors. Counts every call passed in; the
 * caller pre-filters to the desired range. tz kept for signature stability.
 */
export function answeredVsMissed(
  calls: Call[],
  _tz: string,
): { name: string; value: number; color: string }[] {
  let answered = 0;
  let missed = 0;
  for (const c of calls) {
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

export type RangePreset = "today" | "week" | "month" | "year" | "custom";
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

/** Epoch ms of the start of `now`'s calendar day in the given timezone. */
function startOfTodayMs(tz: string, now: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(now));
  const p = (t: string) => Number(parts.find((x) => x.type === t)?.value) || 0;
  const hour = p("hour") === 24 ? 0 : p("hour");
  const elapsedToday = (hour * 3600 + p("minute") * 60 + p("second")) * 1000;
  return now - elapsedToday; // local midnight today for tz
}

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
  } else if (range.preset === "today") {
    startMs = startOfTodayMs(tz, now);
    bucket = "day";
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

/** True when an ISO timestamp falls within a resolved range's span. */
export function inResolvedRange(iso: string, r: ResolvedRange): boolean {
  const t = new Date(iso).getTime();
  return t >= r.startMs && t <= r.endMs;
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

// ===========================================================================
// Dashboard overhaul: KPI deltas, sparklines, heatmap, recovery funnel, SLA,
// metric presets, CSV. All pure over already-fetched arrays. No backend.
// ===========================================================================

/** The equal-length window immediately before a resolved range. */
export function priorRange(r: ResolvedRange): { startMs: number; endMs: number } {
  const span = r.endMs - r.startMs;
  return { startMs: r.startMs - span, endMs: r.startMs };
}

export interface KpiDelta {
  value: number;
  prior: number;
  pct: number | null; // null when prior is 0 (no baseline)
  direction: "up" | "down" | "flat";
}

function makeDelta(value: number, prior: number): KpiDelta {
  let direction: KpiDelta["direction"] = "flat";
  if (value > prior) direction = "up";
  else if (value < prior) direction = "down";
  const pct = prior === 0 ? null : Math.round(((value - prior) / prior) * 100);
  return { value, prior, pct, direction };
}

function callMs(c: Call): number | null {
  const iso = c.created_at ?? c.started_at;
  return iso ? new Date(iso).getTime() : null;
}

/** Range-aware KPIs (Calls, Missed, Answered rate) with prior-period deltas. */
export function computeKpis(
  calls: Call[],
  r: ResolvedRange,
): { total: KpiDelta; missed: KpiDelta; answerRate: KpiDelta } {
  const prior = priorRange(r);
  let curTotal = 0, curMissed = 0, curAnswered = 0;
  let priTotal = 0, priMissed = 0, priAnswered = 0;

  for (const c of calls) {
    const t = callMs(c);
    if (t === null) continue;
    if (t >= r.startMs && t <= r.endMs) {
      curTotal += 1;
      if (c.status === "missed") curMissed += 1;
      else if (c.status === "answered") curAnswered += 1;
    } else if (t >= prior.startMs && t < prior.endMs) {
      priTotal += 1;
      if (c.status === "missed") priMissed += 1;
      else if (c.status === "answered") priAnswered += 1;
    }
  }

  const curRate = curAnswered + curMissed > 0 ? Math.round((curAnswered / (curAnswered + curMissed)) * 100) : 0;
  const priRate = priAnswered + priMissed > 0 ? Math.round((priAnswered / (priAnswered + priMissed)) * 100) : 0;

  return {
    total: makeDelta(curTotal, priTotal),
    missed: makeDelta(curMissed, priMissed),
    answerRate: makeDelta(curRate, priRate),
  };
}

/** Per-bucket series for one KPI across the current range (for sparklines). */
export function kpiSparkline(
  calls: Call[],
  r: ResolvedRange,
  tz: string,
  metric: "calls" | "missed" | "answerRate",
): number[] {
  const n = r.buckets.length;
  const total = new Array(n).fill(0);
  const missed = new Array(n).fill(0);
  const answered = new Array(n).fill(0);
  for (const c of calls) {
    const iso = c.created_at ?? c.started_at;
    if (!iso) continue;
    const i = bucketIndexFor(iso, r, tz);
    if (i < 0) continue;
    total[i] += 1;
    if (c.status === "missed") missed[i] += 1;
    else if (c.status === "answered") answered[i] += 1;
  }
  if (metric === "calls") return total;
  if (metric === "missed") return missed;
  return total.map((_, i) =>
    answered[i] + missed[i] > 0 ? Math.round((answered[i] / (answered[i] + missed[i])) * 100) : 0,
  );
}

/** Day-of-week (0=Sun..6=Sat) for an ISO timestamp in a timezone. */
function dowOf(iso: string, tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(iso));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/** 7x24 grid (grid[dow][hour]) of call counts, plus the max for color scaling. */
export function callsByHourAndDay(calls: Call[], tz: string): { grid: number[][]; max: number } {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let max = 0;
  for (const c of calls) {
    if (!c.created_at) continue;
    const d = dowOf(c.created_at, tz);
    const h = hourOf(c.created_at, tz);
    const v = (grid[d][h] += 1);
    if (v > max) max = v;
  }
  return { grid, max };
}

export interface RecoveryFunnelResult {
  missed: number;
  followedUp: number;
  replied: number;
  replyRate: number | null; // replied / followedUp
}

/** Missed-call recovery funnel over a range: missed -> texted -> replied. */
export function recoveryFunnel(
  calls: Call[],
  messages: Message[],
  r: ResolvedRange,
): RecoveryFunnelResult {
  // Request ids belonging to missed calls within the range.
  const missedReqIds = new Set<string>();
  let missed = 0;
  for (const c of calls) {
    const t = callMs(c);
    if (t === null || t < r.startMs || t > r.endMs) continue;
    if (c.status !== "missed") continue;
    missed += 1;
    if (c.created_request_id) missedReqIds.add(c.created_request_id);
  }
  const outboundReq = new Set<string>();
  const inboundReq = new Set<string>();
  for (const m of messages) {
    if (!m.request_id || !missedReqIds.has(m.request_id)) continue;
    if (m.direction === "outbound") outboundReq.add(m.request_id);
    else inboundReq.add(m.request_id);
  }
  const followedUp = outboundReq.size;
  let replied = 0;
  for (const id of inboundReq) if (outboundReq.has(id)) replied += 1;
  return {
    missed,
    followedUp,
    replied,
    replyRate: followedUp === 0 ? null : Math.round((replied / followedUp) * 100),
  };
}

export type SlaBucket = "overdue" | "dueSoon" | "onTrack";
export interface SlaItem {
  request: CallRequest;
  remainingMs: number;
  bucket: SlaBucket;
}

/** Bucket open callback requests by urgency relative to now. Pure given now. */
export function slaBuckets(
  requests: CallRequest[],
  now: number,
  slaMinutes: number,
  dueSoonMs = 30 * 60_000,
): { counts: Record<SlaBucket, number>; items: SlaItem[] } {
  const counts: Record<SlaBucket, number> = { overdue: 0, dueSoon: 0, onTrack: 0 };
  const items: SlaItem[] = [];
  for (const req of requests) {
    if (req.status === "closed") continue;
    const dueMs = req.due_at
      ? new Date(req.due_at).getTime()
      : new Date(req.created_at).getTime() + slaMinutes * 60_000;
    const remainingMs = dueMs - now;
    const bucket: SlaBucket = remainingMs < 0 ? "overdue" : remainingMs < dueSoonMs ? "dueSoon" : "onTrack";
    counts[bucket] += 1;
    items.push({ request: req, remainingMs, bucket });
  }
  items.sort((a, b) => a.remainingMs - b.remainingMs); // most urgent first
  return { counts, items };
}

/** Named metric bundles for the Trends panel. "Custom" is a UI sentinel. */
export const METRIC_PRESETS: { key: string; label: string; metrics: MetricKey[] }[] = [
  { key: "default", label: "Default", metrics: ["calls", "missed", "missedResponded"] },
  { key: "health", label: "Health", metrics: ["answerRate", "missed", "missedResponded"] },
  { key: "volume", label: "Volume", metrics: ["calls", "answered", "missed"] },
  { key: "engagement", label: "Engagement", metrics: ["followupsSent", "repliesReceived", "newCallers", "returningCallers"] },
];

/** Serialize computeMetricSeries rows to CSV text (CRLF, quoted as needed). */
export function toCsv(rows: Array<Record<string, number | string>>): string {
  if (rows.length === 0) return "";
  const keys: string[] = ["label"];
  for (const row of rows) for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  const esc = (v: unknown): string => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [keys.join(",")];
  for (const row of rows) lines.push(keys.map((k) => esc(row[k])).join(","));
  return lines.join("\r\n");
}
