import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The "password already entered" cookie for a protected share link (spec §5.6): an HMAC over the
 * link id and an expiry instant, valid for an hour, scoped to that link's path. It proves the
 * viewer typed the password on this browser; it carries no secret of its own.
 */
export const SHARE_COOKIE_TTL_MS = 60 * 60 * 1000;

export function shareCookieName(linkId: string): string {
  return `okinvo.share.${linkId}`;
}

function mac(secret: Buffer, linkId: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`${linkId}.${expiresAt}`).digest("hex");
}

export function signShareCookie(linkId: string, secret: Buffer, now: Date): string {
  const expiresAt = now.getTime() + SHARE_COOKIE_TTL_MS;
  return `${expiresAt}.${mac(secret, linkId, expiresAt)}`;
}

export function verifyShareCookie(
  value: string | undefined | null,
  linkId: string,
  secret: Buffer,
  now: Date,
): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expiresAt = Number(value.slice(0, dot));
  const given = value.slice(dot + 1);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now.getTime()) return false;
  if (expiresAt > now.getTime() + SHARE_COOKIE_TTL_MS) return false;
  const expected = mac(secret, linkId, expiresAt);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
}
