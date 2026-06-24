/**
 * Pure placeholder renderer for SMS templates. No imports, so it is safe to use
 * in both server code (the send service) and client code (the Settings preview).
 *
 * Supported tokens: {business} and {name}. Unknown tokens are left untouched.
 * The "there" fallback for an unknown caller name is applied by callers, not
 * here, so this stays a dumb substitution.
 */
export function renderTemplate(
  template: string,
  vars: { business: string; name: string },
): string {
  return template
    .replace(/\{business\}/g, vars.business)
    .replace(/\{name\}/g, vars.name);
}

/** Default used when a business has no template set. */
export const DEFAULT_FOLLOWUP_TEMPLATE =
  "Hi {name}, this is {business}. Sorry we missed your call. Drop a quick description of what we can help you with and we'll get back to you as soon as possible.";

/** Debounce window: send the ack this long after the caller's LAST inbound SMS. */
export const ACK_DEBOUNCE_MS = 30_000;

/** Default auto-acknowledgment sent after a caller replies. */
export const DEFAULT_ACK_TEMPLATE =
  "Thanks {name}, this is {business}. We've received your message and will get back to you very soon.";
