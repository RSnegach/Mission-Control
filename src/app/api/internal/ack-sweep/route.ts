import { sendDueAcks } from "@/lib/ack";

// Runs on the Node runtime so the Twilio SDK / node:sqlite resolve at runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal endpoint that sends any due auto-acknowledgments. Hit by the in-process
 * interval (src/instrumentation.ts) in dev/single-host, and is the same endpoint a
 * production scheduled cron would call. Kept off the public surface; in production
 * protect it with a shared secret.
 */
export async function POST() {
  try {
    const result = await sendDueAcks();
    return Response.json(result);
  } catch (e) {
    console.error("[ack-sweep] failed", e);
    return Response.json({ sent: 0, error: true }, { status: 500 });
  }
}
