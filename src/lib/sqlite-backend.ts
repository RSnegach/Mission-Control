import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { toE164 } from "./phone";
import type { DataBackend, RequestPatch } from "./backend";
import type {
  Activity,
  Business,
  BusinessSettings,
  Call,
  CallRequest,
  Contact,
  Message,
  Tag,
  Task,
} from "./types";

/**
 * Durable, per-business data store backed by Node's built-in node:sqlite.
 * Selected when DATA_BACKEND=sqlite. No cloud account, no extra dependency.
 *
 * Data lives in ./.data/mission-control.sqlite (gitignored). All rows carry
 * business_id, same tenant model as the Supabase backend. On first use the
 * schema is created and, if empty, seeded with ~12 months of demo history so
 * the trend charts have something to plot.
 *
 * Note: this file store is for local dev / a single host. It does NOT work on
 * Vercel serverless (ephemeral filesystem); production uses DATA_BACKEND=supabase.
 */

// node:sqlite types are not guaranteed in the installed @types/node, so type the
// surface we use locally and load the builtin via createRequire (also keeps it
// opaque to the bundler).
interface SqliteStatement {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}
interface SqliteDB {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
type DatabaseSyncCtor = new (filename: string) => SqliteDB;

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

// --- connection singleton (survives dev HMR) -------------------------------
const GLOBAL_KEY = "__mission_control_sqlite__";

function dbPath(): string {
  const dir = path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "mission-control.sqlite");
}

function handle(): SqliteDB {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    const db = new DatabaseSync(dbPath());
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
    bootstrapSchema(db);
    seedIfEmpty(db);
    g[GLOBAL_KEY] = db;
  }
  return g[GLOBAL_KEY] as SqliteDB;
}

// --- query helpers ----------------------------------------------------------
/** SQLite rejects undefined/boolean; normalize binds to null/int/json text. */
function bind(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (Array.isArray(p) || (p !== null && typeof p === "object")) return JSON.stringify(p);
    return p;
  });
}
function get(sql: string, params: unknown[] = []): Record<string, unknown> | null {
  return handle().prepare(sql).get(...bind(params)) ?? null;
}
function all(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  return handle().prepare(sql).all(...bind(params));
}
function run(sql: string, params: unknown[] = []): void {
  handle().prepare(sql).run(...bind(params));
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function nowIso(): string {
  return new Date().toISOString();
}

// --- schema -----------------------------------------------------------------
function bootstrapSchema(db: SqliteDB): void {
  db.exec(`
    create table if not exists businesses (
      id text primary key,
      name text not null,
      slug text unique not null,
      timezone text not null default 'America/New_York',
      status text not null default 'active',
      created_at text not null,
      updated_at text not null
    );
    create table if not exists business_settings (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      default_route_phone text,
      voicemail_greeting text,
      after_hours_behavior text,
      dial_timeout_seconds integer not null default 20,
      callback_sla_minutes integer,
      sms_followup_enabled integer not null default 1,
      sms_followup_template text,
      ack_enabled integer not null default 1,
      ack_template text,
      created_at text not null,
      updated_at text not null,
      unique (business_id)
    );
    create table if not exists twilio_numbers (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      phone_number text unique not null,
      twilio_sid text,
      type text not null default 'local',
      status text not null default 'active',
      created_at text not null
    );
    create table if not exists contacts (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      name text,
      phone text,
      email text,
      created_at text not null,
      updated_at text not null,
      unique (business_id, phone)
    );
    create table if not exists calls (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      twilio_call_sid text unique not null,
      parent_call_sid text,
      from_number text,
      to_number text,
      contact_id text references contacts(id) on delete set null,
      direction text not null default 'inbound',
      status text not null default 'incoming',
      route_target text,
      started_at text,
      answered_at text,
      ended_at text,
      duration_seconds integer,
      recording_url text,
      recording_sid text,
      outcome text,
      created_request_id text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists requests (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      contact_id text references contacts(id) on delete set null,
      call_id text references calls(id) on delete set null,
      title text not null,
      category text,
      priority text not null default 'normal',
      status text not null default 'new',
      due_at text,
      description text,
      source text,
      ack_due_at text,
      ack_sent_at text,
      scheduled_for text,
      reminder_sent_at text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists call_events (
      id text primary key,
      business_id text references businesses(id) on delete cascade,
      call_id text references calls(id) on delete cascade,
      event_type text not null,
      payload_json text,
      created_at text not null
    );
    create table if not exists messages (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      contact_id text references contacts(id) on delete set null,
      request_id text references requests(id) on delete set null,
      twilio_message_sid text unique,
      direction text not null,
      from_number text,
      to_number text,
      body text not null default '',
      status text,
      media_urls text,
      created_at text not null
    );
    create table if not exists activity (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      contact_id text references contacts(id) on delete set null,
      request_id text references requests(id) on delete set null,
      kind text not null,
      body text not null default '',
      created_by text,
      created_at text not null
    );
    create table if not exists tags (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      name text not null,
      color text not null default '#4f7dff',
      created_at text not null,
      unique (business_id, name)
    );
    create table if not exists contact_tags (
      contact_id text not null references contacts(id) on delete cascade,
      tag_id text not null references tags(id) on delete cascade,
      primary key (contact_id, tag_id)
    );
    create table if not exists tasks (
      id text primary key,
      business_id text not null references businesses(id) on delete cascade,
      title text not null,
      description text,
      priority text not null default 'normal',
      status text not null default 'open',
      due_at text,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists idx_calls_business_created on calls(business_id, created_at desc);
    create index if not exists idx_calls_twilio_sid on calls(twilio_call_sid);
    create index if not exists idx_calls_from_number on calls(business_id, from_number);
    create index if not exists idx_contacts_phone on contacts(business_id, phone);
    create index if not exists idx_requests_business_status on requests(business_id, status);
    create unique index if not exists uq_requests_call_source
      on requests(business_id, call_id, source) where call_id is not null and source = 'call';
    create index if not exists idx_messages_business_created on messages(business_id, created_at desc);
    create index if not exists idx_messages_contact on messages(business_id, contact_id, created_at);
    create index if not exists idx_messages_request on messages(business_id, request_id, created_at);
  `);

  // Upgrade a pre-existing DB: `create table if not exists` will not add new
  // columns, so add them idempotently (duplicate-column errors are ignored).
  addColumnIfMissing(db, "business_settings", "ack_enabled", "integer not null default 1");
  addColumnIfMissing(db, "business_settings", "ack_template", "text");
  addColumnIfMissing(db, "requests", "ack_due_at", "text");
  addColumnIfMissing(db, "requests", "ack_sent_at", "text");
  addColumnIfMissing(db, "requests", "scheduled_for", "text");
  addColumnIfMissing(db, "requests", "reminder_sent_at", "text");

  db.exec(`
    create index if not exists idx_requests_ack_due
      on requests(business_id, ack_due_at) where ack_due_at is not null and ack_sent_at is null;
    create index if not exists idx_requests_reminder
      on requests(scheduled_for) where scheduled_for is not null and reminder_sent_at is null;
    create index if not exists idx_activity_contact on activity(business_id, contact_id, created_at desc);
    create index if not exists idx_activity_request on activity(business_id, request_id, created_at desc);
    create index if not exists idx_contact_tags_contact on contact_tags(contact_id);
    create index if not exists idx_tasks_business on tasks(business_id, created_at desc);
  `);
}

function addColumnIfMissing(db: SqliteDB, table: string, column: string, decl: string): void {
  try {
    db.exec(`alter table ${table} add column ${column} ${decl}`);
  } catch {
    // Column already exists; ignore.
  }
}

// --- row mappers ------------------------------------------------------------
function mapBusiness(r: Record<string, unknown>): Business {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    timezone: r.timezone as string,
    status: r.status as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}
function mapSettings(r: Record<string, unknown>): BusinessSettings {
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    default_route_phone: (r.default_route_phone as string) ?? null,
    voicemail_greeting: (r.voicemail_greeting as string) ?? null,
    after_hours_behavior: (r.after_hours_behavior as string) ?? null,
    dial_timeout_seconds: Number(r.dial_timeout_seconds ?? 20),
    callback_sla_minutes:
      r.callback_sla_minutes === null || r.callback_sla_minutes === undefined
        ? null
        : Number(r.callback_sla_minutes),
    sms_followup_enabled: r.sms_followup_enabled === 1 || r.sms_followup_enabled === true,
    sms_followup_template: (r.sms_followup_template as string) ?? null,
    ack_enabled: r.ack_enabled === 1 || r.ack_enabled === true,
    ack_template: (r.ack_template as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}
function mapContact(r: Record<string, unknown>): Contact {
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    name: (r.name as string) ?? null,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}
function mapCall(r: Record<string, unknown>): Call {
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    twilio_call_sid: r.twilio_call_sid as string,
    parent_call_sid: (r.parent_call_sid as string) ?? null,
    from_number: (r.from_number as string) ?? null,
    to_number: (r.to_number as string) ?? null,
    contact_id: (r.contact_id as string) ?? null,
    direction: r.direction as string,
    status: r.status as string,
    route_target: (r.route_target as string) ?? null,
    started_at: (r.started_at as string) ?? null,
    answered_at: (r.answered_at as string) ?? null,
    ended_at: (r.ended_at as string) ?? null,
    duration_seconds:
      r.duration_seconds === null || r.duration_seconds === undefined
        ? null
        : Number(r.duration_seconds),
    recording_url: (r.recording_url as string) ?? null,
    recording_sid: (r.recording_sid as string) ?? null,
    outcome: (r.outcome as string) ?? null,
    created_request_id: (r.created_request_id as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}
function mapRequest(r: Record<string, unknown>): CallRequest {
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    contact_id: (r.contact_id as string) ?? null,
    call_id: (r.call_id as string) ?? null,
    title: r.title as string,
    category: (r.category as string) ?? null,
    priority: r.priority as string,
    status: r.status as string,
    due_at: (r.due_at as string) ?? null,
    description: (r.description as string) ?? null,
    source: (r.source as string) ?? null,
    ack_due_at: (r.ack_due_at as string) ?? null,
    ack_sent_at: (r.ack_sent_at as string) ?? null,
    scheduled_for: (r.scheduled_for as string) ?? null,
    reminder_sent_at: (r.reminder_sent_at as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}
function mapActivity(r: Record<string, unknown>): Activity {
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    contact_id: (r.contact_id as string) ?? null,
    request_id: (r.request_id as string) ?? null,
    kind: r.kind as string,
    body: (r.body as string) ?? "",
    created_by: (r.created_by as string) ?? null,
    created_at: r.created_at as string,
  };
}
function mapTag(r: Record<string, unknown>): Tag {
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    name: r.name as string,
    color: r.color as string,
    created_at: r.created_at as string,
  };
}
function mapTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    priority: r.priority as string,
    status: r.status as string,
    due_at: (r.due_at as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}
function mapMessage(r: Record<string, unknown>): Message {
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    contact_id: (r.contact_id as string) ?? null,
    request_id: (r.request_id as string) ?? null,
    twilio_message_sid: (r.twilio_message_sid as string) ?? null,
    direction: r.direction === "outbound" ? "outbound" : "inbound",
    from_number: (r.from_number as string) ?? null,
    to_number: (r.to_number as string) ?? null,
    body: (r.body as string) ?? "",
    status: (r.status as string) ?? "",
    media_urls: r.media_urls ? (JSON.parse(r.media_urls as string) as string[]) : null,
    created_at: r.created_at as string,
  };
}

// --- backend ----------------------------------------------------------------
export class SqliteBackend implements DataBackend {
  async findBusinessByTwilioNumber(toNumber: string): Promise<Business | null> {
    const normalized = toE164(toNumber);
    if (!normalized) return null;
    const r = get(
      `select b.* from twilio_numbers tn
         join businesses b on b.id = tn.business_id
        where tn.phone_number = ? and tn.status = 'active'`,
      [normalized],
    );
    return r ? mapBusiness(r) : null;
  }

  async getSettings(businessId: string): Promise<BusinessSettings | null> {
    const r = get(`select * from business_settings where business_id = ?`, [businessId]);
    return r ? mapSettings(r) : null;
  }

  async findOrCreateContact(businessId: string, fromNumber: string): Promise<Contact | null> {
    const normalized = toE164(fromNumber);
    if (!normalized) return null;

    const existing = get(`select * from contacts where business_id = ? and phone = ?`, [
      businessId,
      normalized,
    ]);
    if (existing) return mapContact(existing);

    const now = nowIso();
    const id = newId("con");
    try {
      run(
        `insert into contacts (id, business_id, name, phone, email, created_at, updated_at)
         values (?, ?, null, ?, null, ?, ?)`,
        [id, businessId, normalized, now, now],
      );
    } catch {
      // Lost a race on the unique (business_id, phone); re-select.
      const retry = get(`select * from contacts where business_id = ? and phone = ?`, [
        businessId,
        normalized,
      ]);
      if (retry) return mapContact(retry);
      throw new Error("contact insert failed");
    }
    const row = get(`select * from contacts where id = ?`, [id]);
    return row ? mapContact(row) : null;
  }

  async createIncomingCall(params: {
    businessId: string;
    callSid: string;
    fromNumber: string;
    toNumber: string;
    contactId: string | null;
  }): Promise<Call> {
    const existing = get(`select * from calls where twilio_call_sid = ?`, [params.callSid]);
    if (existing) {
      const row = mapCall(existing);
      if (row.business_id !== params.businessId) {
        throw new Error(`CallSid ${params.callSid} already belongs to a different business`);
      }
      return row;
    }
    const now = nowIso();
    const id = newId("call");
    try {
      run(
        `insert into calls (id, business_id, twilio_call_sid, from_number, to_number, contact_id,
           direction, status, started_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, 'inbound', 'incoming', ?, ?, ?)`,
        [id, params.businessId, params.callSid, params.fromNumber, params.toNumber, params.contactId, now, now, now],
      );
    } catch {
      const retry = get(`select * from calls where twilio_call_sid = ?`, [params.callSid]);
      if (retry) {
        const row = mapCall(retry);
        if (row.business_id !== params.businessId) {
          throw new Error(`CallSid ${params.callSid} already belongs to a different business`);
        }
        return row;
      }
      throw new Error("call insert failed");
    }
    return mapCall(get(`select * from calls where id = ?`, [id])!);
  }

  async updateCallBySid(
    callSid: string,
    patch: Partial<Omit<Call, "id" | "business_id" | "twilio_call_sid" | "created_at">>,
  ): Promise<Call | null> {
    const allowed = new Set([
      "parent_call_sid", "from_number", "to_number", "contact_id", "direction", "status",
      "route_target", "started_at", "answered_at", "ended_at", "duration_seconds",
      "recording_url", "recording_sid", "outcome", "created_request_id", "updated_at",
    ]);
    const cols: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.has(k)) continue;
      cols.push(`${k} = ?`);
      vals.push(v);
    }
    cols.push("updated_at = ?");
    vals.push(nowIso());
    vals.push(callSid);
    run(`update calls set ${cols.join(", ")} where twilio_call_sid = ?`, vals);
    const row = get(`select * from calls where twilio_call_sid = ?`, [callSid]);
    return row ? mapCall(row) : null;
  }

  async getCallBySid(callSid: string): Promise<Call | null> {
    const r = get(`select * from calls where twilio_call_sid = ?`, [callSid]);
    return r ? mapCall(r) : null;
  }

  async createMissedCallRequest(call: Call): Promise<CallRequest | null> {
    const dedup = () =>
      get(
        `select * from requests where business_id = ? and call_id = ? and source = 'call'
         order by created_at asc limit 1`,
        [call.business_id, call.id],
      );
    const existing = dedup();
    if (existing) return mapRequest(existing);

    const settings = await this.getSettings(call.business_id);
    const slaMinutes = settings?.callback_sla_minutes ?? 60;
    const now = nowIso();
    const dueAt = new Date(Date.now() + slaMinutes * 60_000).toISOString();
    const id = newId("req");
    try {
      run(
        `insert into requests (id, business_id, contact_id, call_id, title, priority, status, source, due_at, created_at, updated_at)
         values (?, ?, ?, ?, 'Missed call callback', 'normal', 'needs_callback', 'call', ?, ?, ?)`,
        [id, call.business_id, call.contact_id, call.id, dueAt, now, now],
      );
    } catch {
      const retry = dedup();
      if (retry) return mapRequest(retry);
      throw new Error("request insert failed");
    }
    try {
      run(`update calls set created_request_id = ?, updated_at = ? where id = ?`, [id, now, call.id]);
    } catch (e) {
      console.error("[sqlite] failed to link created_request_id", e);
    }
    return mapRequest(get(`select * from requests where id = ?`, [id])!);
  }

  async recordCallEvent(params: {
    businessId: string | null;
    callId: string | null;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    run(
      `insert into call_events (id, business_id, call_id, event_type, payload_json, created_at)
       values (?, ?, ?, ?, ?, ?)`,
      [newId("evt"), params.businessId, params.callId, params.eventType, JSON.stringify(params.payload), nowIso()],
    );
  }

  async listCalls(businessId: string, limit = 100): Promise<Call[]> {
    return all(
      `select * from calls where business_id = ? order by created_at desc limit ?`,
      [businessId, limit],
    ).map(mapCall);
  }

  async listMissedRequests(businessId: string, limit = 100): Promise<CallRequest[]> {
    return all(
      `select * from requests where business_id = ? and status = 'needs_callback'
       order by created_at desc limit ?`,
      [businessId, limit],
    ).map(mapRequest);
  }

  async getPrimaryBusiness(): Promise<Business | null> {
    const r = get(`select * from businesses order by created_at asc limit 1`);
    return r ? mapBusiness(r) : null;
  }

  async getContactsByIds(businessId: string, ids: string[]): Promise<Map<string, Contact>> {
    const map = new Map<string, Contact>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return map;
    const placeholders = unique.map(() => "?").join(",");
    const rows = all(
      `select * from contacts where business_id = ? and id in (${placeholders})`,
      [businessId, ...unique],
    );
    for (const r of rows) {
      const c = mapContact(r);
      map.set(c.id, c);
    }
    return map;
  }

  async listMessagesByContact(businessId: string, contactId: string, limit = 200): Promise<Message[]> {
    return all(
      `select * from messages where business_id = ? and contact_id = ?
       order by created_at asc limit ?`,
      [businessId, contactId, limit],
    ).map(mapMessage);
  }

  async listMessagesByRequest(businessId: string, requestId: string): Promise<Message[]> {
    return all(
      `select * from messages where business_id = ? and request_id = ? order by created_at asc`,
      [businessId, requestId],
    ).map(mapMessage);
  }

  async listMessagesByCall(businessId: string, callId: string): Promise<Message[]> {
    const call = get(`select * from calls where business_id = ? and id = ?`, [businessId, callId]);
    if (!call) return [];
    const mapped = mapCall(call);
    if (mapped.created_request_id) {
      const byReq = await this.listMessagesByRequest(businessId, mapped.created_request_id);
      if (byReq.length) return byReq;
    }
    if (mapped.contact_id) return this.listMessagesByContact(businessId, mapped.contact_id);
    return [];
  }

  async listRecentMessages(businessId: string, limit = 200): Promise<Message[]> {
    return all(
      `select * from messages where business_id = ? order by created_at desc limit ?`,
      [businessId, limit],
    ).map(mapMessage);
  }

  async getContactById(businessId: string, contactId: string): Promise<Contact | null> {
    const r = get(`select * from contacts where business_id = ? and id = ?`, [businessId, contactId]);
    return r ? mapContact(r) : null;
  }

  async listContacts(businessId: string, limit = 200): Promise<Contact[]> {
    return all(
      `select * from contacts where business_id = ? order by created_at desc limit ?`,
      [businessId, limit],
    ).map(mapContact);
  }

  async listCallsByContact(businessId: string, contactId: string, limit = 100): Promise<Call[]> {
    return all(
      `select * from calls where business_id = ? and contact_id = ? order by created_at desc limit ?`,
      [businessId, contactId, limit],
    ).map(mapCall);
  }

  async listRequestsByContact(businessId: string, contactId: string, limit = 100): Promise<CallRequest[]> {
    return all(
      `select * from requests where business_id = ? and contact_id = ? order by created_at desc limit ?`,
      [businessId, contactId, limit],
    ).map(mapRequest);
  }

  async updateSettings(
    businessId: string,
    patch: Partial<
      Pick<
        BusinessSettings,
        | "default_route_phone"
        | "sms_followup_enabled"
        | "sms_followup_template"
        | "ack_enabled"
        | "ack_template"
      >
    >,
  ): Promise<BusinessSettings | null> {
    const allowed = new Set([
      "default_route_phone",
      "sms_followup_enabled",
      "sms_followup_template",
      "ack_enabled",
      "ack_template",
    ]);
    const boolCols = new Set(["sms_followup_enabled", "ack_enabled"]);
    const cols: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.has(k)) continue;
      cols.push(`${k} = ?`);
      vals.push(boolCols.has(k) ? (v ? 1 : 0) : v);
    }
    if (cols.length === 0) return this.getSettings(businessId);
    cols.push("updated_at = ?");
    vals.push(nowIso());
    vals.push(businessId);
    run(`update business_settings set ${cols.join(", ")} where business_id = ?`, vals);
    return this.getSettings(businessId);
  }

  async createOutboundMessage(params: {
    businessId: string;
    contactId: string | null;
    requestId: string | null;
    fromNumber: string;
    toNumber: string;
    body: string;
    status?: string;
    twilioMessageSid?: string | null;
  }): Promise<Message> {
    const id = newId("msg");
    run(
      `insert into messages (id, business_id, contact_id, request_id, twilio_message_sid,
         direction, from_number, to_number, body, status, media_urls, created_at)
       values (?, ?, ?, ?, ?, 'outbound', ?, ?, ?, ?, null, ?)`,
      [
        id, params.businessId, params.contactId, params.requestId, params.twilioMessageSid ?? null,
        params.fromNumber, params.toNumber, params.body, params.status ?? "sent", nowIso(),
      ],
    );
    return mapMessage(get(`select * from messages where id = ?`, [id])!);
  }

  async updateContactName(
    businessId: string,
    contactId: string,
    name: string | null,
  ): Promise<Contact | null> {
    run(`update contacts set name = ?, updated_at = ? where business_id = ? and id = ?`, [
      name,
      nowIso(),
      businessId,
      contactId,
    ]);
    const row = get(`select * from contacts where business_id = ? and id = ?`, [
      businessId,
      contactId,
    ]);
    return row ? mapContact(row) : null;
  }

  async createInboundMessage(params: {
    businessId: string;
    contactId: string | null;
    requestId: string | null;
    fromNumber: string;
    toNumber: string;
    body: string;
    status?: string;
    twilioMessageSid?: string | null;
    mediaUrls?: string[] | null;
  }): Promise<Message> {
    if (params.twilioMessageSid) {
      const existing = get(`select * from messages where twilio_message_sid = ?`, [
        params.twilioMessageSid,
      ]);
      if (existing) return mapMessage(existing);
    }
    const id = newId("msg");
    try {
      run(
        `insert into messages (id, business_id, contact_id, request_id, twilio_message_sid,
           direction, from_number, to_number, body, status, media_urls, created_at)
         values (?, ?, ?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?)`,
        [
          id, params.businessId, params.contactId, params.requestId, params.twilioMessageSid ?? null,
          params.fromNumber, params.toNumber, params.body, params.status ?? "received",
          params.mediaUrls ? JSON.stringify(params.mediaUrls) : null, nowIso(),
        ],
      );
    } catch {
      // Duplicate MessageSid race; return the existing row.
      if (params.twilioMessageSid) {
        const existing = get(`select * from messages where twilio_message_sid = ?`, [
          params.twilioMessageSid,
        ]);
        if (existing) return mapMessage(existing);
      }
      throw new Error("inbound message insert failed");
    }
    return mapMessage(get(`select * from messages where id = ?`, [id])!);
  }

  async listDueAckThreads(now: string, limit = 100): Promise<CallRequest[]> {
    return all(
      `select * from requests
        where ack_due_at is not null and ack_sent_at is null and ack_due_at <= ?
        order by ack_due_at asc limit ?`,
      [now, limit],
    ).map(mapRequest);
  }

  async armAck(businessId: string, requestId: string, dueAt: string): Promise<void> {
    run(
      `update requests set ack_due_at = ?, updated_at = ?
        where business_id = ? and id = ? and ack_sent_at is null`,
      [dueAt, nowIso(), businessId, requestId],
    );
  }

  async markAckSent(businessId: string, requestId: string, sentAt: string): Promise<boolean> {
    const res = handle()
      .prepare(
        `update requests set ack_sent_at = ?, ack_due_at = null, updated_at = ?
          where business_id = ? and id = ? and ack_sent_at is null`,
      )
      .run(sentAt, nowIso(), businessId, requestId);
    return Number(res.changes) > 0;
  }

  // --- Requests: triage, create, schedule ---
  async getRequestById(businessId: string, requestId: string): Promise<CallRequest | null> {
    const r = get(`select * from requests where business_id = ? and id = ?`, [businessId, requestId]);
    return r ? mapRequest(r) : null;
  }

  async listRequests(businessId: string, limit = 500): Promise<CallRequest[]> {
    return all(`select * from requests where business_id = ? order by created_at desc limit ?`, [businessId, limit]).map(mapRequest);
  }

  async updateRequest(businessId: string, requestId: string, patch: RequestPatch): Promise<CallRequest | null> {
    const allowed = new Set(["status", "priority", "due_at", "description", "scheduled_for"]);
    const cols: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.has(k)) continue;
      cols.push(`${k} = ?`);
      vals.push(v);
    }
    if (cols.length === 0) return this.getRequestById(businessId, requestId);
    cols.push("updated_at = ?");
    vals.push(nowIso(), businessId, requestId);
    run(`update requests set ${cols.join(", ")} where business_id = ? and id = ?`, vals);
    return this.getRequestById(businessId, requestId);
  }

  async createRequest(params: {
    businessId: string; contactId: string | null; title: string;
    priority?: string; dueAt?: string | null; description?: string | null; source?: string;
  }): Promise<CallRequest> {
    const id = newId("req");
    const now = nowIso();
    run(
      `insert into requests (id, business_id, contact_id, call_id, title, priority, status, due_at, description, source, created_at, updated_at)
       values (?, ?, ?, null, ?, ?, 'needs_callback', ?, ?, ?, ?, ?)`,
      [id, params.businessId, params.contactId, params.title, params.priority ?? "normal",
       params.dueAt ?? null, params.description ?? null, params.source ?? "manual", now, now],
    );
    return mapRequest(get(`select * from requests where id = ?`, [id])!);
  }

  async listDueReminders(now: string, limit = 100): Promise<CallRequest[]> {
    return all(
      `select * from requests where scheduled_for is not null and reminder_sent_at is null
        and scheduled_for <= ? and status not in ('completed','cancelled')
        order by scheduled_for asc limit ?`,
      [now, limit],
    ).map(mapRequest);
  }

  async markReminderSent(businessId: string, requestId: string, sentAt: string): Promise<boolean> {
    const res = handle()
      .prepare(`update requests set reminder_sent_at = ? where business_id = ? and id = ? and reminder_sent_at is null`)
      .run(sentAt, businessId, requestId);
    return Number(res.changes) > 0;
  }

  async getBusinessFromNumber(businessId: string): Promise<string | null> {
    const r = get(`select phone_number from twilio_numbers where business_id = ? and status = 'active' limit 1`, [businessId]);
    return r ? (r.phone_number as string) : null;
  }

  // --- Contacts: create ---
  async createContact(params: {
    businessId: string; name?: string | null; phone?: string | null; email?: string | null;
  }): Promise<Contact> {
    const normalized = params.phone ? toE164(params.phone) : null;
    if (normalized) {
      const existing = get(`select * from contacts where business_id = ? and phone = ?`, [params.businessId, normalized]);
      if (existing) return mapContact(existing);
    }
    const id = newId("con");
    const now = nowIso();
    try {
      run(
        `insert into contacts (id, business_id, name, phone, email, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)`,
        [id, params.businessId, params.name?.trim() || null, normalized, params.email?.trim() || null, now, now],
      );
    } catch {
      if (normalized) {
        const retry = get(`select * from contacts where business_id = ? and phone = ?`, [params.businessId, normalized]);
        if (retry) return mapContact(retry);
      }
      throw new Error("contact insert failed");
    }
    return mapContact(get(`select * from contacts where id = ?`, [id])!);
  }

  // --- Activity / notes ---
  async createActivity(params: {
    businessId: string; contactId?: string | null; requestId?: string | null;
    kind: string; body: string; createdBy?: string | null;
  }): Promise<Activity> {
    const id = newId("act");
    run(
      `insert into activity (id, business_id, contact_id, request_id, kind, body, created_by, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.businessId, params.contactId ?? null, params.requestId ?? null, params.kind, params.body, params.createdBy ?? null, nowIso()],
    );
    return mapActivity(get(`select * from activity where id = ?`, [id])!);
  }

  async listActivityByContact(businessId: string, contactId: string, limit = 200): Promise<Activity[]> {
    return all(`select * from activity where business_id = ? and contact_id = ? order by created_at desc limit ?`, [businessId, contactId, limit]).map(mapActivity);
  }

  async listActivityByRequest(businessId: string, requestId: string, limit = 200): Promise<Activity[]> {
    return all(`select * from activity where business_id = ? and request_id = ? order by created_at desc limit ?`, [businessId, requestId, limit]).map(mapActivity);
  }

  // --- Tags ---
  async listTags(businessId: string): Promise<Tag[]> {
    return all(`select * from tags where business_id = ? order by name asc`, [businessId]).map(mapTag);
  }

  async createTag(businessId: string, name: string, color: string): Promise<Tag> {
    const existing = get(`select * from tags where business_id = ? and name = ?`, [businessId, name]);
    if (existing) return mapTag(existing);
    const id = newId("tag");
    try {
      run(`insert into tags (id, business_id, name, color, created_at) values (?, ?, ?, ?, ?)`, [id, businessId, name, color, nowIso()]);
    } catch {
      const retry = get(`select * from tags where business_id = ? and name = ?`, [businessId, name]);
      if (retry) return mapTag(retry);
      throw new Error("tag insert failed");
    }
    return mapTag(get(`select * from tags where id = ?`, [id])!);
  }

  async addTagToContact(_businessId: string, contactId: string, tagId: string): Promise<void> {
    try {
      run(`insert into contact_tags (contact_id, tag_id) values (?, ?)`, [contactId, tagId]);
    } catch {
      // already tagged; ignore
    }
  }

  async removeTagFromContact(_businessId: string, contactId: string, tagId: string): Promise<void> {
    run(`delete from contact_tags where contact_id = ? and tag_id = ?`, [contactId, tagId]);
  }

  async listTagsForContacts(businessId: string, contactIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    const unique = [...new Set(contactIds.filter(Boolean))];
    if (unique.length === 0) return map;
    const ph = unique.map(() => "?").join(",");
    const rows = all(
      `select ct.contact_id, ct.tag_id from contact_tags ct
         join tags t on t.id = ct.tag_id
        where t.business_id = ? and ct.contact_id in (${ph})`,
      [businessId, ...unique],
    );
    for (const r of rows) {
      const cid = r.contact_id as string;
      const arr = map.get(cid) ?? [];
      arr.push(r.tag_id as string);
      map.set(cid, arr);
    }
    return map;
  }

  // --- Tasks ---
  async createTask(params: {
    businessId: string; title: string; description?: string | null; priority?: string; dueAt?: string | null;
  }): Promise<Task> {
    const id = newId("task");
    const now = nowIso();
    run(
      `insert into tasks (id, business_id, title, description, priority, status, due_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      [id, params.businessId, params.title, params.description ?? null, params.priority ?? "normal", params.dueAt ?? null, now, now],
    );
    return mapTask(get(`select * from tasks where id = ?`, [id])!);
  }

  async listTasks(businessId: string, limit = 200): Promise<Task[]> {
    return all(`select * from tasks where business_id = ? order by created_at desc limit ?`, [businessId, limit]).map(mapTask);
  }

  async updateTask(
    businessId: string,
    taskId: string,
    patch: Partial<Pick<Task, "title" | "description" | "priority" | "status" | "due_at">>,
  ): Promise<Task | null> {
    const allowed = new Set(["title", "description", "priority", "status", "due_at"]);
    const cols: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.has(k)) continue;
      cols.push(`${k} = ?`);
      vals.push(v);
    }
    if (cols.length === 0) {
      const cur = get(`select * from tasks where business_id = ? and id = ?`, [businessId, taskId]);
      return cur ? mapTask(cur) : null;
    }
    cols.push("updated_at = ?");
    vals.push(nowIso(), businessId, taskId);
    run(`update tasks set ${cols.join(", ")} where business_id = ? and id = ?`, vals);
    const row = get(`select * from tasks where business_id = ? and id = ?`, [businessId, taskId]);
    return row ? mapTask(row) : null;
  }
}

// --- backfill seed ----------------------------------------------------------
const SEED = {
  monthsBack: 12,
  missedRate: 0.3,
  followupRate: 0.7,
  replyRate: 0.5,
  extraContacts: 12,
  // Only seed SMS threads for missed calls within this recent window, so the
  // inbox stays a believable size and every seeded body can be unique.
  messageWindowDays: 21,
};

function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}
function chance(p: number): boolean {
  return Math.random() < p;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface SeedContact { id: string; name: string | null; phone: string }

/** Insert demo data when the store is empty. Idempotent and transactional. */
function seedIfEmpty(db: SqliteDB): void {
  const count = db.prepare(`select count(*) as n from businesses`).get() as { n: number };
  if (count.n > 0) return;

  const businessId = "biz_demo_marine";
  const tn = "+13215550100";
  const route = "+13215550199";
  const start = Date.now() - SEED.monthsBack * 30 * 86_400_000;

  // Known contacts (match the in-memory demo identities) + generated extras.
  const contacts: SeedContact[] = [
    { id: "con_1", name: "John at ABC Marine", phone: "+14075550123" },
    { id: "con_2", name: "Smith LLC", phone: "+13215550144" },
    { id: "con_3", name: null, phone: "+14075558831" },
    { id: "con_4", name: null, phone: "+13215550199" },
  ];
  // Distinct, real-sounding names (no numeric suffixes); a few left unknown.
  const EXTRA_NAMES: (string | null)[] = [
    "Coastal Charters",
    "Reef Runners Dive Co",
    "Marina Bay Rentals",
    "Blue Water Tours",
    "Captain Dave Hollis",
    null,
    "Tideline Fishing",
    "Anchor Down Yacht Club",
    "Maria Vasquez",
    "Gulfstream Charters",
    null,
    "Sandbar Grill",
  ];
  EXTRA_NAMES.forEach((name, i) => {
    contacts.push({
      id: `con_seed_${i}`,
      name,
      phone: `+1407556${String(2000 + i).padStart(4, "0")}`,
    });
  });
  // Returning callers: the first ~60% get picked more often.
  const returningPool = contacts.slice(0, Math.ceil(contacts.length * 0.6));

  interface GenCall {
    id: string; sid: string; contact: SeedContact; startedAt: Date; missed: boolean;
    duration: number | null; requestId: string | null;
  }
  const calls: GenCall[] = [];
  let sidN = 1000;

  const dayMs = 86_400_000;
  for (let t = start; t <= Date.now(); t += dayMs) {
    const day = new Date(t);
    const dow = day.getDay(); // 0 Sun .. 6 Sat
    const weekend = dow === 0 || dow === 6;
    // Mild upward growth across the window so trend lines slope.
    const progress = (t - start) / (Date.now() - start);
    const base = weekend ? randInt(1, 4) : randInt(5, 12) + Math.round(progress * 4);
    for (let c = 0; c < base; c++) {
      const contact = chance(0.6) ? pick(returningPool) : pick(contacts);
      const hour = randInt(8, 18);
      const started = new Date(day);
      started.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
      if (started.getTime() > Date.now()) continue;
      const missed = chance(SEED.missedRate);
      calls.push({
        id: newId("call"),
        sid: `CA_seed_${sidN++}`,
        contact,
        startedAt: started,
        missed,
        duration: missed ? null : randInt(30, 600),
        requestId: missed ? newId("req") : null,
      });
    }
  }

  // First-call time per contact, for realistic contact.created_at.
  const firstCallAt = new Map<string, number>();
  for (const c of calls) {
    const prev = firstCallAt.get(c.contact.id);
    if (prev === undefined || c.startedAt.getTime() < prev) {
      firstCallAt.set(c.contact.id, c.startedAt.getTime());
    }
  }

  const tx = db;
  tx.exec("BEGIN");
  try {
    const now = nowIso();
    tx.prepare(
      `insert into businesses (id, name, slug, timezone, status, created_at, updated_at)
       values (?, 'Demo Marine Repair', 'demo-marine', 'America/New_York', 'active', ?, ?)`,
    ).run(businessId, new Date(start).toISOString(), now);

    tx.prepare(
      `insert into business_settings (id, business_id, default_route_phone, voicemail_greeting,
         after_hours_behavior, dial_timeout_seconds, callback_sla_minutes, sms_followup_enabled,
         sms_followup_template, ack_enabled, ack_template, created_at, updated_at)
       values (?, ?, ?, ?, 'voicemail', 20, 60, 1, ?, 1, ?, ?, ?)`,
    ).run(
      "set_demo", businessId, route,
      "Thanks for calling Demo Marine Repair. Please leave a message after the beep.",
      "Hi {name}, this is {business}. Sorry we missed your call. Drop a quick description of what we can help you with and we'll get back to you as soon as possible.",
      "Thanks {name}, this is {business}. We've received your message and will get back to you very soon.",
      now, now,
    );

    tx.prepare(
      `insert into twilio_numbers (id, business_id, phone_number, type, status, created_at)
       values ('tn_1', ?, ?, 'local', 'active', ?)`,
    ).run(businessId, tn, new Date(start).toISOString());

    const insContact = tx.prepare(
      `insert into contacts (id, business_id, name, phone, email, created_at, updated_at)
       values (?, ?, ?, ?, null, ?, ?)`,
    );
    for (const c of contacts) {
      const createdMs = firstCallAt.get(c.id) ?? start;
      const iso = new Date(createdMs).toISOString();
      insContact.run(c.id, businessId, c.name, c.phone, iso, iso);
    }

    const insCall = tx.prepare(
      `insert into calls (id, business_id, twilio_call_sid, from_number, to_number, contact_id,
         direction, status, route_target, started_at, answered_at, ended_at, duration_seconds,
         outcome, created_request_id, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insReq = tx.prepare(
      `insert into requests (id, business_id, contact_id, call_id, title, priority, status, source, due_at, created_at, updated_at)
       values (?, ?, ?, ?, 'Missed call callback', 'normal', ?, 'call', ?, ?, ?)`,
    );
    const insMsg = tx.prepare(
      `insert into messages (id, business_id, contact_id, request_id, twilio_message_sid,
         direction, from_number, to_number, body, status, media_urls, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?)`,
    );

    // First write every call + its missed-call request.
    for (const c of calls) {
      const startedIso = c.startedAt.toISOString();
      const status = c.missed ? "missed" : "answered";
      const answeredIso = c.missed ? null : startedIso;
      const endedMs = c.startedAt.getTime() + (c.missed ? 25_000 : (c.duration ?? 0) * 1000);
      const endedIso = new Date(endedMs).toISOString();
      insCall.run(
        c.id, businessId, c.sid, c.contact.phone, tn, c.contact.id,
        status, route, startedIso, answeredIso, endedIso, c.duration,
        status, c.requestId, startedIso, endedIso,
      );

      if (c.missed && c.requestId) {
        const ageDays = (Date.now() - c.startedAt.getTime()) / dayMs;
        const reqStatus = ageDays > 7 ? "closed" : "needs_callback";
        const dueIso = new Date(c.startedAt.getTime() + 60 * 60_000).toISOString();
        insReq.run(c.requestId, businessId, c.contact.id, c.id, reqStatus, dueIso, startedIso, startedIso);
      }
    }

    // Curated SMS conversations. Each is ONE coherent exchange about a single
    // issue, attached to the contact's most recent missed call, so every thread
    // in the inbox reads naturally (no stacked auto-replies, no mismatched
    // replies). The product sends one fixed follow-up template, so the outbound
    // line is identical across threads, which is correct; the inbound replies are
    // all distinct and on-topic.
    const followup = (name: string) =>
      `Hi ${name}, this is Demo Marine Repair. Sorry we missed your call. Drop a quick description of what we can help you with and we'll get back to you as soon as possible.`;

    // Templates of believable customer replies, one issue per conversation.
    // [contactIndex is assigned by order to recent missed callers]
    const CONVERSATIONS: { replies: string[] }[] = [
      { replies: ["My inboard is overheating after about ten minutes on plane. Can someone take a look this week?", "It's a 2019 Sea Ray 320. I'm at the Cocoa Beach marina."] },
      { replies: ["Looking for a quote to winterize two outboards before the season ends."] },
      { replies: ["The bilge pump keeps cycling on and off even when the boat is dry.", "Happy to bring it in whenever you have an opening."] },
      { replies: ["Trim tabs stopped responding on the starboard side. What would a repair run?"] },
      { replies: ["Need to schedule annual engine service. When's your earliest?", "Great, mornings work best for me."] },
      { replies: ["Smelling fuel in the cabin after the last trip. Want it checked before we go out again."] },
      { replies: ["Lower unit is leaking gear oil. Are you open this weekend?"] },
      { replies: ["Want a haul-out and bottom paint quote for a 28 foot cruiser."] },
      { replies: ["Chartplotter won't hold a GPS fix anymore. Could be the antenna?", "It's a Garmin, maybe four years old."] },
      { replies: ["Booking a pre-purchase survey on a boat I'm looking at. Do you do those?"] },
      { replies: ["Batteries aren't holding a charge overnight. Probably need a new bank."] },
      { replies: ["Props are dinged up and need reconditioning before the tournament."] },
    ];

    // Most recent missed call per contact, within the message window.
    const recentMissedByContact = new Map<string, GenCall>();
    const cutoff = Date.now() - SEED.messageWindowDays * dayMs;
    for (const c of calls) {
      if (!c.missed || !c.requestId) continue;
      if (c.startedAt.getTime() < cutoff) continue;
      const prev = recentMissedByContact.get(c.contact.id);
      if (!prev || c.startedAt.getTime() > prev.startedAt.getTime()) {
        recentMissedByContact.set(c.contact.id, c);
      }
    }

    // Attach one curated conversation to each such contact, newest callers first,
    // so the demo inbox shows a handful of clean, distinct threads.
    const targets = [...recentMissedByContact.values()]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, CONVERSATIONS.length);

    targets.forEach((c, i) => {
      const convo = CONVERSATIONS[i];
      const name = c.contact.name?.split(" ")[0] ?? "there";
      const outMs = c.startedAt.getTime() + 60_000;
      insMsg.run(
        newId("msg"), businessId, c.contact.id, c.requestId, `SM_seed_${c.id}`,
        "outbound", tn, c.contact.phone, followup(name), "delivered",
        new Date(outMs).toISOString(),
      );
      convo.replies.forEach((body, r) => {
        const inMs = outMs + (r + 1) * randInt(3, 18) * 60_000;
        insMsg.run(
          newId("msg"), businessId, c.contact.id, c.requestId, null,
          "inbound", c.contact.phone, tn, body, "received",
          new Date(inMs).toISOString(),
        );
      });
    });

    // Seed a few tags so segmentation is demoable immediately.
    const insTag = tx.prepare(
      `insert into tags (id, business_id, name, color, created_at) values (?, ?, ?, ?, ?)`,
    );
    insTag.run("tag_vip", businessId, "VIP", "#fbbf24", now);
    insTag.run("tag_residential", businessId, "Residential", "#34d399", now);
    insTag.run("tag_commercial", businessId, "Commercial", "#60a5fa", now);
    const insCt = tx.prepare(`insert into contact_tags (contact_id, tag_id) values (?, ?)`);
    insCt.run("con_1", "tag_commercial");
    insCt.run("con_2", "tag_vip");

    tx.exec("COMMIT");
  } catch (e) {
    tx.exec("ROLLBACK");
    throw e;
  }
}
