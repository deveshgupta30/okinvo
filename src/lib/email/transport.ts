import type { ServerEnv } from "@/lib/env.schema";
import type { SmtpConfig, SmtpSecurity } from "@/lib/schemas";

export type SmtpEnv = Pick<
  ServerEnv,
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_SECURITY"
  | "SMTP_USER"
  | "SMTP_PASSWORD"
  | "SMTP_FROM"
  | "SMTP_FROM_NAME"
  | "SMTP_REPLY_TO"
>;

export interface ResolvedSmtp {
  source: "settings" | "env";
  host: string;
  port: number;
  security: SmtpSecurity;
  user?: string;
  password?: string;
  from: string;
  fromName?: string;
  replyTo?: string;
}

/**
 * SPEC §4.16: Settings → Email wins over the environment; neither configured → null (the composer
 * then offers the mail-app flow). Pure: the stored password is decrypted through the callback.
 */
export function resolveSmtpConfigFrom(
  setting: SmtpConfig | null,
  env: SmtpEnv,
  decrypt: (ciphertext: string) => string,
): ResolvedSmtp | null {
  if (setting) {
    const r: ResolvedSmtp = {
      source: "settings",
      host: setting.host,
      port: setting.port,
      security: setting.security,
      from: setting.from,
    };
    if (setting.user) r.user = setting.user;
    if (setting.passwordEnc) r.password = decrypt(setting.passwordEnc);
    if (setting.fromName) r.fromName = setting.fromName;
    if (setting.replyTo) r.replyTo = setting.replyTo;
    return r;
  }
  if (env.SMTP_HOST && env.SMTP_FROM) {
    const r: ResolvedSmtp = {
      source: "env",
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      security: env.SMTP_SECURITY,
      from: env.SMTP_FROM,
    };
    if (env.SMTP_USER) r.user = env.SMTP_USER;
    if (env.SMTP_PASSWORD) r.password = env.SMTP_PASSWORD;
    if (env.SMTP_FROM_NAME) r.fromName = env.SMTP_FROM_NAME;
    if (env.SMTP_REPLY_TO) r.replyTo = env.SMTP_REPLY_TO;
    return r;
  }
  return null;
}

/** `"Name" <address>` when a display name is set. */
export function fromHeader(r: ResolvedSmtp): string {
  return r.fromName ? `"${r.fromName.replace(/"/g, "'")}" <${r.from}>` : r.from;
}

/** nodemailer transport options for a resolved config (starttls | tls | none). */
export function transportOptions(r: ResolvedSmtp) {
  return {
    host: r.host,
    port: r.port,
    secure: r.security === "tls",
    requireTLS: r.security === "starttls",
    ignoreTLS: r.security === "none",
    ...(r.user ? { auth: { user: r.user, pass: r.password ?? "" } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}
