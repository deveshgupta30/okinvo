import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db";
import { InvariantError } from "./errors";

/** One receipt or bill on a payment (addendum §4), as the ledger and the exports see it. */
export interface PaymentAttachmentDto {
  id: string;
  assetId: string;
  contentType: string;
  byteSize: number;
  /** `pdf`, `png`, `jpg` or `webp`: the stored extension, for file names and icons. */
  ext: string;
}

export const ATTACHMENT_INCLUDE = {
  attachments: {
    orderBy: { position: "asc" },
    include: { asset: { select: { contentType: true, byteSize: true, storageKey: true } } },
  },
} satisfies Prisma.PaymentInclude;

type AttachmentRow = Prisma.PaymentAttachmentGetPayload<{
  include: { asset: { select: { contentType: true; byteSize: true; storageKey: true } } };
}>;

export function attachmentExt(storageKey: string): string {
  const dot = storageKey.lastIndexOf(".");
  return dot === -1 ? "bin" : storageKey.slice(dot + 1).toLowerCase();
}

export function toAttachmentDto(row: AttachmentRow): PaymentAttachmentDto {
  return {
    id: row.id,
    assetId: row.assetId,
    contentType: row.asset.contentType,
    byteSize: row.asset.byteSize,
    ext: attachmentExt(row.asset.storageKey),
  };
}

/**
 * Makes the payment's attachments exactly `assetIds`, in that order, inside the caller's
 * transaction. Every id must be an existing RECEIPT asset (PDF or image, validated at upload);
 * anything else is refused as a whole so a form cannot smuggle a logo or an avatar in.
 */
export async function syncPaymentAttachments(
  tx: Tx,
  paymentId: string,
  assetIds: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(assetIds)];
  if (unique.length > 0) {
    const assets = await tx.asset.findMany({
      where: { id: { in: unique } },
      select: { id: true, kind: true },
    });
    const receipts = new Set(assets.filter((a) => a.kind === "RECEIPT").map((a) => a.id));
    const bad = unique.filter((id) => !receipts.has(id));
    if (bad.length > 0) {
      throw new InvariantError("Only uploaded receipts (PDF or image) can be attached.", {
        attachmentAssetIds: ["not a receipt"],
      });
    }
  }
  await tx.paymentAttachment.deleteMany({
    where: { paymentId, ...(unique.length > 0 ? { assetId: { notIn: unique } } : {}) },
  });
  const existing = new Set(
    (await tx.paymentAttachment.findMany({ where: { paymentId }, select: { assetId: true } })).map(
      (r) => r.assetId,
    ),
  );
  for (const [position, assetId] of unique.entries()) {
    if (existing.has(assetId)) {
      await tx.paymentAttachment.updateMany({ where: { paymentId, assetId }, data: { position } });
    } else {
      await tx.paymentAttachment.create({ data: { paymentId, assetId, position } });
    }
  }
  return unique;
}
