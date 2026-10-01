import { z } from "zod";

/**
 * `AppSetting['smtp']` and `AppSetting['emailDefaults']` (IMPLEMENTATION_PLAN_v2.md §12.4).
 * `passwordEnc` is the ciphertext produced by `src/lib/crypto`; this module never sees the
 * plaintext password. Browser-safe.
 */

export const SMTP_SECURITY = ["starttls", "tls", "none"] as const;
export type SmtpSecurity = (typeof SMTP_SECURITY)[number];

export const SmtpConfigSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.coerce.number().int().min(1).max(65535),
  security: z.enum(SMTP_SECURITY),
  user: z.string().trim().min(1).max(254).optional(),
  passwordEnc: z.string().min(1).optional(),
  from: z.email(),
  fromName: z.string().trim().max(80).optional(),
  replyTo: z.email().optional(),
});

export type SmtpConfig = z.infer<typeof SmtpConfigSchema>;

export const EmailDefaultsSchema = z.object({
  cc: z.array(z.email()).max(10).default([]),
  bcc: z.array(z.email()).max(10).default([]),
});

export type EmailDefaults = z.infer<typeof EmailDefaultsSchema>;

const EmailSchema = z.email();

/**
 * Split a comma-, semicolon- or newline-separated list of addresses, trimming each entry.
 * Throws an Error naming the first invalid entry.
 */
export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const entries = raw
    .split(/[,;\r\n]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  for (const entry of entries) {
    if (!EmailSchema.safeParse(entry).success) {
      throw new Error(`invalid email address "${entry}"`);
    }
  }
  return entries;
}
