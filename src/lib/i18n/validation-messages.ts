/**
 * The most common validation messages are produced server-side (Zod and `parseForm`) as fixed
 * English strings; the form components map those strings to catalogue keys under
 * `errors.validation` before rendering, so they follow the UI language. Anything not listed here
 * is shown as the server sent it (spec §8.1: the long tail of Zod messages stays English).
 */
export const VALIDATION_KEYS = {
  required: "required",
  "must be a valid email": "invalidEmail",
  "must be a calendar date in YYYY-MM-DD form": "invalidDate",
  "must be a number": "invalidAmount",
  "must be a whole number": "wholeNumber",
  "must be greater than zero": "greaterThanZero",
  "Please correct the highlighted fields.": "fixFields",
  "Only standard keyboard characters are allowed.": "charset",
} as const;

export type ValidationKey = (typeof VALIDATION_KEYS)[keyof typeof VALIDATION_KEYS] | "tooLong";

const TOO_LONG = /^Too big: expected string to have <=(\d+) characters$/;

export interface ValidationLookup {
  key: ValidationKey;
  values?: Record<string, number>;
}

/** The catalogue key (and ICU values) for a raw validation message, or null to show it as is. */
export function validationMessageKey(raw: string): ValidationLookup | null {
  const direct = (VALIDATION_KEYS as Record<string, ValidationKey | undefined>)[raw];
  if (direct) return { key: direct };
  const long = TOO_LONG.exec(raw);
  if (long) return { key: "tooLong", values: { max: Number(long[1]) } };
  return null;
}
