import "server-only";
import type { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { assetKey, storage, type AssetKind } from "@/lib/storage";
import type { PreparedUpload } from "@/lib/uploads";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { NotFoundError } from "./errors";
import { requireWriter } from "./authz";

export interface AssetDto {
  id: string;
  kind: AssetKind;
  storageKey: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
}

/** Store a validated upload: blob first, row second — an orphan blob is harmless, a dangling row is not. */
export async function createAsset(
  actor: Actor,
  kind: AssetKind,
  prepared: PreparedUpload,
): Promise<AssetDto> {
  if (kind !== "AVATAR") requireWriter(actor); // a profile photo is the person's own
  const id = crypto.randomUUID();
  const key = assetKey(kind, id, prepared.ext);
  await storage.put(key, prepared.buffer, {
    contentType: prepared.contentType,
    byteSize: prepared.byteSize,
  });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.asset.create({
      data: {
        id,
        kind,
        storageKey: key,
        contentType: prepared.contentType,
        byteSize: prepared.byteSize,
        width: prepared.width ?? null,
        height: prepared.height ?? null,
        sha256: prepared.sha256,
        createdById: actor.userId,
      },
    });
    await audit(tx, actor, "asset.uploaded", "Asset", id, {
      summary: `Uploaded ${kind.toLowerCase()} (${prepared.byteSize} bytes)`,
      after: { kind, contentType: prepared.contentType, byteSize: prepared.byteSize },
    });
    return created;
  });
  return {
    id: row.id,
    kind: row.kind,
    storageKey: row.storageKey,
    contentType: row.contentType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
  };
}

export async function getAssetStream(
  _actor: Actor,
  storageKey: string,
): Promise<{ asset: AssetDto; stream: Readable }> {
  const row = await prisma.asset.findUnique({ where: { storageKey } });
  if (!row) throw new NotFoundError("Asset");
  const obj = await storage.get(storageKey);
  return {
    asset: {
      id: row.id,
      kind: row.kind,
      storageKey: row.storageKey,
      contentType: row.contentType,
      byteSize: row.byteSize,
      width: row.width,
      height: row.height,
      sha256: row.sha256,
    },
    stream: obj.stream,
  };
}

export async function getAssetStreamById(
  actor: Actor,
  assetId: string,
): Promise<{ asset: AssetDto; stream: Readable }> {
  const row = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { storageKey: true },
  });
  if (!row) throw new NotFoundError("Asset", assetId);
  return getAssetStream(actor, row.storageKey);
}

/** Raw bytes of an asset, for embedding in PDFs. Null when missing so a render never fails on a logo. */
export async function readAssetBytes(assetId: string): Promise<Buffer | null> {
  const row = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!row) return null;
  try {
    const obj = await storage.get(row.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of obj.stream) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}
