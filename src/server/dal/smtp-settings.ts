import "server-only";
import { decryptField, encryptField } from "@/lib/crypto";
import { fieldKey } from "@/lib/crypto/key";
import { prisma } from "@/lib/db";
import { sendMail, verifyTransport } from "@/lib/email/send";
import { textToHtml } from "@/lib/email/templates";
import { resolveSmtpConfigFrom, type ResolvedSmtp } from "@/lib/email/transport";
import { env } from "@/lib/env";
import {
  EmailDefaultsSchema,
  SmtpConfigSchema,
  type EmailDefaults,
  type SmtpConfig,
  type SmtpSecurity,
} from "@/lib/schemas";
import type { SmtpSettingsInput } from "@/lib/schemas/email-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { InvariantError } from "./errors";
import { requireWriter } from "./authz";
import { deleteSetting, getSetting, putSetting } from "./settings";

export interface SmtpSettingsView {
  source: "settings" | "env" | "none";
  host?: string;
  port?: number;
  security?: SmtpSecurity;
  user?: string;
  hasPassword: boolean;
  from?: string;
  fromName?: string;
  replyTo?: string;
  /** True when SMTP_* is set in the environment (shown even while settings override it). */
  envConfigured: boolean;
  emailDefaults: EmailDefaults;
}

const envSmtp = () => ({
  SMTP_HOST: env.SMTP_HOST,
  SMTP_PORT: env.SMTP_PORT,
  SMTP_SECURITY: env.SMTP_SECURITY,
  SMTP_USER: env.SMTP_USER,
  SMTP_PASSWORD: env.SMTP_PASSWORD,
  SMTP_FROM: env.SMTP_FROM,
  SMTP_FROM_NAME: env.SMTP_FROM_NAME,
  SMTP_REPLY_TO: env.SMTP_REPLY_TO,
});

/** Settings first, then the environment, else null (SPEC §4.16). */
export async function resolveSmtp(): Promise<ResolvedSmtp | null> {
  const setting = await getSetting(prisma, "smtp", SmtpConfigSchema);
  return resolveSmtpConfigFrom(setting, envSmtp(), (enc) => decryptField(enc, fieldKey()));
}

export async function getEmailDefaults(): Promise<EmailDefaults> {
  return (await getSetting(prisma, "emailDefaults", EmailDefaultsSchema)) ?? { cc: [], bcc: [] };
}

export async function getSmtpSettings(_actor: Actor): Promise<SmtpSettingsView> {
  const [setting, defaults] = await Promise.all([
    getSetting(prisma, "smtp", SmtpConfigSchema),
    getEmailDefaults(),
  ]);
  const e = envSmtp();
  const envConfigured = Boolean(e.SMTP_HOST && e.SMTP_FROM);
  if (setting) {
    return {
      source: "settings",
      host: setting.host,
      port: setting.port,
      security: setting.security,
      ...(setting.user ? { user: setting.user } : {}),
      hasPassword: Boolean(setting.passwordEnc),
      from: setting.from,
      ...(setting.fromName ? { fromName: setting.fromName } : {}),
      ...(setting.replyTo ? { replyTo: setting.replyTo } : {}),
      envConfigured,
      emailDefaults: defaults,
    };
  }
  if (envConfigured && e.SMTP_HOST && e.SMTP_FROM) {
    return {
      source: "env",
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      security: e.SMTP_SECURITY,
      ...(e.SMTP_USER ? { user: e.SMTP_USER } : {}),
      hasPassword: Boolean(e.SMTP_PASSWORD),
      from: e.SMTP_FROM,
      ...(e.SMTP_FROM_NAME ? { fromName: e.SMTP_FROM_NAME } : {}),
      ...(e.SMTP_REPLY_TO ? { replyTo: e.SMTP_REPLY_TO } : {}),
      envConfigured,
      emailDefaults: defaults,
    };
  }
  return { source: "none", hasPassword: false, envConfigured, emailDefaults: defaults };
}

/** Password is write-only: blank keeps the stored ciphertext; the audit diff redacts it. */
export async function saveSmtpSettings(
  actor: Actor,
  input: Omit<SmtpSettingsInput, "port"> & { port: number },
): Promise<void> {
  requireWriter(actor);
  const existing = await getSetting(prisma, "smtp", SmtpConfigSchema);
  const config: SmtpConfig = SmtpConfigSchema.parse({
    host: input.host,
    port: input.port,
    security: input.security,
    ...(input.user ? { user: input.user } : {}),
    ...(input.password
      ? { passwordEnc: encryptField(input.password, fieldKey()) }
      : existing?.passwordEnc && input.user
        ? { passwordEnc: existing.passwordEnc }
        : {}),
    from: input.from,
    ...(input.fromName ? { fromName: input.fromName } : {}),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });
  await prisma.$transaction((tx) => putSetting(tx, actor, "smtp", config, SmtpConfigSchema));
}

export async function clearSmtpSettings(actor: Actor): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction((tx) => deleteSetting(tx, actor, "smtp"));
}

export async function saveEmailDefaults(actor: Actor, input: EmailDefaults): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction((tx) =>
    putSetting(tx, actor, "emailDefaults", input, EmailDefaultsSchema),
  );
}

/** Delivers a short message to the signed-in person to prove the connection works. */
export async function sendTestEmail(
  actor: Actor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  requireWriter(actor);
  const r = await resolveSmtp();
  if (!r) throw new InvariantError("SMTP is not configured.");
  const verified = await verifyTransport(r);
  if (!verified.ok) {
    await audit(prisma, actor, "email.test_failed", "AppSetting", "smtp", {
      summary: verified.error,
    });
    return verified;
  }
  try {
    const text = `This is a test message from okinvo (${env.APP_URL}). Your SMTP settings work.`;
    await sendMail(r, {
      to: [actor.email],
      subject: "okinvo test email",
      text,
      html: textToHtml(text),
    });
    await audit(prisma, actor, "email.test_sent", "AppSetting", "smtp", {
      summary: `Test email to ${actor.email}`,
    });
    return { ok: true };
  } catch (e) {
    const error = (e as Error).message;
    await audit(prisma, actor, "email.test_failed", "AppSetting", "smtp", { summary: error });
    return { ok: false, error };
  }
}
