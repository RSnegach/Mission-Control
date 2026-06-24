/**
 * Server startup hook. Runs a small interval that triggers the auto-ack sweep so
 * acks fire ~30s after a caller's last reply without anyone loading a page.
 *
 * It calls the internal sweep ENDPOINT over HTTP rather than importing the ack
 * module directly. That keeps the Twilio SDK (which needs Node net/tls) out of
 * the instrumentation compilation graph, and mirrors the production pattern of a
 * scheduled cron hitting the same endpoint. Dev / single-host only; on serverless
 * the interval does not persist (the webhook + Messages page also sweep).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as Record<string, unknown>;
  if (g.__ack_sweeper_started__) return;
  g.__ack_sweeper_started__ = true;

  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const SWEEP_INTERVAL_MS = 10_000;

  const secret = process.env.ACK_SWEEP_SECRET;
  const headers: Record<string, string> = secret ? { "x-ack-secret": secret } : {};
  const handle = setInterval(() => {
    fetch(`${base}/api/internal/ack-sweep`, { method: "POST", headers }).catch(() => {
      // Server may still be starting, or briefly down; ignore and retry next tick.
    });
  }, SWEEP_INTERVAL_MS);
  if (typeof handle.unref === "function") handle.unref();
}
