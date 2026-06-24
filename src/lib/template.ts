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
  "Hi {name}, this is {business}. Sorry we missed your call. Reply here and we'll help you out.";
