import { Readable } from "node:stream";
import { cookies } from "next/headers";
import { shareCookieName, verifyShareCookie } from "@/lib/security/share-cookie";
import { StorageNotFoundError } from "@/lib/storage";
import { NotFoundError } from "@/server/dal/errors";
import {
  lookupShare,
  recordShareView,
  shareCookieSecret,
  shareDocumentStream,
} from "@/server/dal/share-links";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/**
 * The shared file (spec §5.6): the link's own password-protected copy behind the cookie gate, or
 * the canonical PDF for an open link. Unknown, revoked and expired links all answer 404.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const limited = await enforceRateLimit(request.headers, "share");
  if (limited) return limited;
  const { token } = await ctx.params;
  const view = await lookupShare(token);
  if (!view) return Response.json({ error: "not_found" }, { status: 404 });
  if (view.requiresPassword) {
    const ok = verifyShareCookie(
      (await cookies()).get(shareCookieName(view.linkId))?.value,
      view.linkId,
      shareCookieSecret(),
      new Date(),
    );
    if (!ok) return Response.json({ error: "password_required" }, { status: 403 });
  }
  try {
    const { document, stream } = await shareDocumentStream(view.linkId);
    await recordShareView(view.linkId, "download");
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(document.byteSize),
        "Content-Disposition": `attachment; filename="${document.filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof StorageNotFoundError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
