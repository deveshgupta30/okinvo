/**
 * GSTIN (India): 2-digit state code, 10-char PAN, entity number, "Z", mod-36 check digit.
 * Shape per the GST network; the check digit uses the standard alternating 1/2 weights over the
 * base-36 alphabet (spec §4.2).
 */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normaliseGstin(value: string): string {
  return value.trim().toUpperCase();
}

/** Check digit for the first 14 characters (already normalised). */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = ALPHABET.indexOf(first14[i] ?? "");
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36] ?? "0";
}

export function isValidGstin(value: string): boolean {
  const g = normaliseGstin(value);
  if (!SHAPE.test(g)) return false;
  return gstinCheckDigit(g.slice(0, 14)) === g[14];
}
