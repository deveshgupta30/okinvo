/**
 * UK VAT registration number: 9 digits (optionally "GB", spaces, and a 3-digit branch suffix).
 * The check digits satisfy the modulus-97 test, or the modulus-9755 variant used for numbers
 * issued since 2009. GD/HA government and health-authority prefixes are not VAT-registered
 * businesses okinvo invoices, so they are not accepted here.
 */
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2];

export function normaliseGbVat(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  return `GB${digits}`;
}

function passes(nine: string): boolean {
  let total = 0;
  for (let i = 0; i < 7; i++) total += Number(nine[i]) * (WEIGHTS[i] ?? 0);
  const check = Number(nine.slice(7));
  let a = total;
  while (a > 0) a -= 97;
  if (-a === check) return true;
  let b = total + 55;
  while (b > 0) b -= 97;
  return -b === check;
}

export function isValidGbVat(value: string): boolean {
  const trimmed = value.trim().toUpperCase().replace(/\s+/g, "");
  const body = trimmed.startsWith("GB") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9]{9}([0-9]{3})?$/.test(body)) return false;
  return passes(body.slice(0, 9));
}
