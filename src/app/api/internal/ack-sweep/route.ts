import { sendDueAcks } from "@/lib/ack";
import { sendDueReminders } from "@/lib/reminders";

// Runs on the Node runtime so the Twilio SDK / node:sqlite resolve at runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal sweep endpoint: sends due auto-acknowledgments AND due scheduled-callback
 * reminders. Hit by the in-process interval (src/instrumentation.ts) in dev/single-host,
 * and is the same endpoint a production scheduled cron would call. Protected by a
 * shared secret when configured (it is reachable over the public URL).
 */
export async function POST(req: Request) {
  const secret = process.env.ACK_SWEEP_SECRET;
  if (secret && req.headers.get("x-ack-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const [acks, reminders] = await Promise.all([sendDueAcks(), sendDueReminders()]);
    return Response.json({ acks: acks.sent, reminders: reminders.sent });
  } catch (e) {
    console.error("[ack-sweep] failed", e);
    return Response.json({ error: true }, { status: 500 });
  }
}
