/**
 * A length-and-classes password estimate with no dependency, safe in the browser: guidance for
 * the person choosing a manual password, not a guarantee. Generated passphrases always score 4.
 */
export interface PasswordStrength {
  /** 0 = unusable … 4 = strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: "very weak" | "weak" | "fair" | "good" | "strong";
}

const LABELS: PasswordStrength["label"][] = ["very weak", "weak", "fair", "good", "strong"];

export function passwordStrength(password: string): PasswordStrength {
  const length = [...password].length;
  if (length === 0) return { score: 0, label: LABELS[0]! };
  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  const words = password.split(/[-\s]+/).filter((w) => w.length >= 3).length;
  let score = 0;
  if (length >= 8) score += 1;
  if (length >= 12) score += 1;
  if (length >= 16 || words >= 5) score += 1;
  if (classes >= 3 || (length >= 20 && classes >= 2) || words >= 6) score += 1;
  if (length < 6) score = 0;
  const clamped = Math.min(4, score) as PasswordStrength["score"];
  return { score: clamped, label: LABELS[clamped]! };
}
