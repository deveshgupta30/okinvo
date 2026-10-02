import { Readable } from "node:stream";
import { StorageNotFoundError } from "@/lib/storage";
import { isActor, requireActorApi } from "@/server/auth";
import { getAssetStream, getAssetStreamById } from "@/server/dal/assets";
import { NotFoundError } from "@/server/dal/errors";

export const runtime = "nodejs";

/** Authenticated streaming of stored assets; nothing in storage is reachable without a session. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const actor = await requireActorApi("VIEWER");
  if (!isActor(actor)) return actor;
  const { key } = await ctx.params;
  try {
    // `/api/assets/id/<assetId>` resolves by id (snapshots store ids); otherwise the storage key.
    const { asset, stream } =
      key[0] === "id" && key[1]
        ? await getAssetStreamById(actor, key[1])
        : await getAssetStream(actor, key.join("/"));
    const disposition = asset.contentType === "application/pdf" ? "attachment" : "inline";
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.byteSize),
        "Content-Disposition": `${disposition}; filename="${asset.id}.${asset.storageKey.split(".").pop()}"`,
        "Cache-Control": "private, max-age=0, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof StorageNotFoundError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
