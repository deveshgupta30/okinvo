import { NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { isHoneypotFilled } from "@/lib/security/honeypot";
import { originAllowed } from "@/lib/security/origin";
import { shareCookieName, SHARE_COOKIE_TTL_MS, signShareCookie } from "@/lib/security/share-cookie";
import { lookupShare, shareCookieSecret, verifySharePassword } from "@/server/dal/share-links";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/**
 * The password gate (spec §5.6): a same-origin form POST. A right password sets the hour-long
 * cookie scoped to this link's path and redirects back; a wrong one redirects with `?error`.
 * Attempts are limited per link and address; the answer never says whether the link exists.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  if (!originAllowed(request.headers, env.APP_URL)) {
    return Response.json({ error: "bad_origin" }, { status: 403 });
  }
  const { token } = await ctx.params;
  // Redirects resolve against APP_URL, the canonical origin: in dev Next reports request.url on
  // `localhost` even when the browser came by 127.0.0.1, and `form-action 'self'` would then
  // block the redirect as cross-origin.
  const back = (error?: string) =>
    NextResponse.redirect(
      new URL(`/i/${token}${error ? `?error=${error}` : ""}`, env.APP_URL),
      303,
    );
  const limited = await enforceRateLimit(request.headers, "share");
  if (limited) return back("limited");
  const form = await request.formData();
  if (isHoneypotFilled(form)) return back(); // a bot: looks like success, grants nothing
  const password = String(form.get("password") ?? "");
  const view = await lookupShare(token);
  if (!view) return back("wrong");
  const result = await verifySharePassword(
    view.linkId,
    password,
    clientIp(request.headers, env.TRUST_PROXY),
  );
  if (result === "rate_limited") return back("limited");
  if (result === "wrong") return back("wrong");
  const response = back();
  const https =
    request.headers.get("x-forwarded-proto") === "https" || request.url.startsWith("https:");
  response.cookies.set(
    shareCookieName(view.linkId),
    signShareCookie(view.linkId, shareCookieSecret(), new Date()),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: https,
      path: `/i/${token}`,
      maxAge: SHARE_COOKIE_TTL_MS / 1000,
    },
  );
  return response;
}
