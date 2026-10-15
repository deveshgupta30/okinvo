/** The bullet that stands in for a hidden character in masked fields (addendum §3). */
export const MASK_CHAR = "•";

/**
 * Hides a sensitive identifier (PAN, GSTIN, VAT number, account, IFSC, UPI id, API key) except
 * its last `keep` characters, so a person can still tell which one it is. Values no longer than
 * the tail are hidden completely: revealing "1234" of "1234" would reveal everything.
 */
export function maskValue(value: string, keep = 4): string {
  const v = value.trim();
  if (v.length === 0) return "";
  if (v.length <= keep) return MASK_CHAR.repeat(v.length);
  return MASK_CHAR.repeat(v.length - keep) + v.slice(-keep);
}
