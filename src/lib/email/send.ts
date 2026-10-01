import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { fromHeader, transportOptions, type ResolvedSmtp } from "./transport";

const cache = new Map<string, Transporter>();

/** One transport per distinct configuration; rebuilt automatically when settings change. */
export function getTransport(r: ResolvedSmtp): Transporter {
  const key = JSON.stringify(r);
  let t = cache.get(key);
  if (!t) {
    cache.clear();
    t = nodemailer.createTransport(transportOptions(r));
    cache.set(key, t);
  }
  return t;
}

/** Backs "Send test email" and the settings page status. */
export async function verifyTransport(
  r: ResolvedSmtp,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getTransport(r).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export async function sendMail(
  r: ResolvedSmtp,
  mail: OutgoingMail,
): Promise<{ messageId: string }> {
  const info = await getTransport(r).sendMail({
    from: fromHeader(r),
    ...(r.replyTo ? { replyTo: r.replyTo } : {}),
    to: mail.to,
    ...(mail.cc?.length ? { cc: mail.cc } : {}),
    ...(mail.bcc?.length ? { bcc: mail.bcc } : {}),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
  });
  return { messageId: info.messageId };
}
