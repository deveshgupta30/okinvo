import { env } from "@/lib/env";
import { UploadError, prepareUpload, type UploadKind } from "@/lib/uploads";
import { isActor, requireOwnerApi } from "@/server/auth";
import { createAsset } from "@/server/dal/assets";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

const KINDS = new Set<UploadKind>(["LOGO", "SIGNATURE", "STAMP", "RECEIPT"]);

/** Multipart `file` + `kind` → validated, normalised, stored asset (v2 §11.2). */
export async function POST(request: Request): Promise<Response> {
  const actor = await requireOwnerApi();
  if (!isActor(actor)) return actor;
  const limited = await enforceRateLimit(request.headers, "uploads", actor.userId);
  if (limited) return limited;

  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  if (!(file instanceof Blob) || !KINDS.has(kind as UploadKind)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const cap =
    (kind === "RECEIPT" ? env.UPLOAD_MAX_RECEIPT_MB : env.UPLOAD_MAX_IMAGE_MB) * 1024 * 1024;
  if (file.size > cap) return Response.json({ error: "TOO_LARGE" }, { status: 413 });

  try {
    const prepared = await prepareUpload(
      Buffer.from(await file.arrayBuffer()),
      kind as UploadKind,
      {
        imageMb: env.UPLOAD_MAX_IMAGE_MB,
        receiptMb: env.UPLOAD_MAX_RECEIPT_MB,
      },
    );
    const asset = await createAsset(actor, kind as UploadKind, prepared);
    return Response.json({
      assetId: asset.id,
      storageKey: asset.storageKey,
      contentType: asset.contentType,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
    });
  } catch (e) {
    if (e instanceof UploadError) {
      return Response.json({ error: e.code }, { status: e.code === "TOO_LARGE" ? 413 : 415 });
    }
    throw e;
  }
}
