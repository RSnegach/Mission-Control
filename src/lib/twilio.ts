import twilio from "twilio";

/**
 * Twilio request helpers: signature validation + reading the form body.
 *
 * Twilio POSTs application/x-www-form-urlencoded. Signature validation hashes
 * the full request URL plus the sorted POST params with your auth token, and
 * compares against the X-Twilio-Signature header (brief sections 20, 26).
 */

/** Parse the urlencoded body into a flat string map. */
export async function readTwilioForm(req: Request): Promise<Record<string, string>> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = typeof value === "string" ? value : "";
  }
  return params;
}

/**
 * The URL Twilio used to reach this endpoint. Behind tunnels/proxies the
 * incoming req.url host is often internal, so we rebuild from APP_BASE_URL,
 * which must exactly match the webhook URL configured in the Twilio console
 * (including https and no trailing slash). Query string is preserved.
 */
export function publicUrlFor(req: Request): string {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";
  const incoming = new URL(req.url);
  return `${base}${incoming.pathname}${incoming.search}`;
}

/**
 * Validate the inbound webhook signature.
 * Returns true when valid OR when validation is disabled via env (early local
 * testing). Set TWILIO_VALIDATE_SIGNATURE=true before production.
 *
 * In MOCK_MODE there are no Twilio credentials and requests come from curl/tests,
 * so validation is always skipped regardless of TWILIO_VALIDATE_SIGNATURE.
 */
export function validateTwilioSignature(
  req: Request,
  params: Record<string, string>,
): boolean {
  if (process.env.MOCK_MODE === "true") return true;

  const enabled = process.env.TWILIO_VALIDATE_SIGNATURE === "true";
  if (!enabled) {
    // TODO: enforce in production. Tracked in README production hardening.
    return true;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) return false;

  const url = publicUrlFor(req);
  return twilio.validateRequest(authToken, signature, url, params);
}

/** Build a <Response> string from inner TwiML. */
export function twiml(inner: string): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/** Minimal XML escape for text injected into TwiML verbs. */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
