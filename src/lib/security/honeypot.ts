/**
 * Spam protection on the public forms (addendum §2 item 18). The forms render a `website` field
 * that is hidden from people (off-screen, no tab stop, hidden from assistive technology); bots
 * that fill every field reveal themselves and the submission is dropped without a message, on
 * top of the rate limits that already apply.
 */
export const HONEYPOT_FIELD = "website";

export function isHoneypotFilled(
  data: FormData | Record<string, FormDataEntryValue | string | null | undefined>,
): boolean {
  const value = data instanceof FormData ? data.get(HONEYPOT_FIELD) : data[HONEYPOT_FIELD];
  return typeof value === "string" && value.trim() !== "";
}
