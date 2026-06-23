/**
 * Phone number normalization to E.164 (brief section 20).
 *
 * Twilio already sends "To"/"From" in E.164 (e.g. +13215551234), so for inbound
 * webhooks this is mostly a guard. For numbers typed into settings/seed it does
 * light cleanup. This is deliberately small; swap in libphonenumber-js if you
 * need full international parsing later.
 */
export function toE164(input: string | null | undefined, defaultCountry = "US"): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // Already E.164.
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;

  // Strip everything except digits.
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (defaultCountry === "US") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }

  // Fallback: assume the caller passed a full international number without +.
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;

  return null;
}
