import { Readable } from "node:stream";
import { StorageNotFoundError } from "@/lib/storage";
import { isActor, requireActorApi } from "@/server/auth";
import { getDocumentStream } from "@/server/dal/documents";
import { NotFoundError } from "@/server/dal/errors";

export const runtime = "nodejs";

/** Authenticated download of a stored PDF, always the stored bytes (SPEC §4.6). */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await requireActorApi("VIEWER");
  if (!isActor(actor)) return actor;
  const { id } = await ctx.params;
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  try {
    const { document, stream } = await getDocumentStream(actor, id);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(document.byteSize),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${document.filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Document-Sha256": document.sha256,
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof StorageNotFoundError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
