"use client";

import { FileText, Image as ImageIcon, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { AttachmentsUpload, DOCUMENT_TYPES } from "@/components/documents/attachments-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatKilobytes } from "@/lib/format";
import type { PaymentAttachmentDto } from "@/server/dal/payment-attachments";

interface Uploaded {
  assetId: string;
  contentType: string;
  byteSize: number;
}

/**
 * Receipts and bills on a payment (addendum §4): several files through the drop zone, each
 * uploaded through /api/uploads as kind RECEIPT the moment it is added, listed with Remove, and
 * posted as repeated `attachmentAssetIds` fields in display order.
 */
export function ReceiptsField({
  name,
  initial,
}: {
  name: string;
  initial: readonly PaymentAttachmentDto[];
}) {
  const t = useTranslations("payments.form");
  const ta = useTranslations("assets");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [files, setFiles] = useState<Uploaded[]>(() =>
    initial.map((a) => ({ assetId: a.assetId, contentType: a.contentType, byteSize: a.byteSize })),
  );
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy((n) => n + 1);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("kind", "RECEIPT");
    try {
      const res = await fetch("/api/uploads", { method: "POST", body });
      const json = (await res.json()) as {
        assetId?: string;
        contentType?: string;
        byteSize?: number;
        error?: string;
      };
      if (!res.ok || !json.assetId) {
        setError(
          json.error === "TOO_LARGE"
            ? ta("tooLarge")
            : json.error === "UNSUPPORTED_TYPE"
              ? ta("unsupportedReceipt")
              : ta("uploadFailed"),
        );
        return;
      }
      const added: Uploaded = {
        assetId: json.assetId,
        contentType: json.contentType ?? file.type,
        byteSize: json.byteSize ?? file.size,
      };
      setFiles((list) => [...list, added]);
    } catch {
      setError(ta("uploadFailed"));
    } finally {
      setBusy((n) => n - 1);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-receipts-field>
      <Label>{t("receipts")}</Label>
      {files.map((f) => (
        <input key={f.assetId} type="hidden" name={name} value={f.assetId} />
      ))}
      <AttachmentsUpload
        dataKind="RECEIPT"
        label={t("receipts")}
        accept={DOCUMENT_TYPES}
        multiple
        busy={busy > 0}
        onFilesAdded={(added) => {
          // one after another, so the list keeps the order the files were chosen in
          void (async () => {
            for (const f of added) await upload(f);
          })();
        }}
        onRejected={() => setError(ta("unsupportedReceipt"))}
      />
      <span className="text-app-caption text-ink-subtle">{t("receiptHint")}</span>
      {error ? (
        <span role="alert" className="text-app-caption text-semantic-danger">
          {error}
        </span>
      ) : null}
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label={t("receipts")}>
          {files.map((f, i) => (
            <li
              key={f.assetId}
              className="flex items-center gap-2 rounded-md border border-hairline bg-surface-1 px-2 py-1 text-app-caption"
            >
              {f.contentType === "application/pdf" ? (
                <FileText
                  aria-hidden
                  className="size-4 shrink-0 text-ink-subtle"
                  strokeWidth={1.5}
                />
              ) : (
                <ImageIcon
                  aria-hidden
                  className="size-4 shrink-0 text-ink-subtle"
                  strokeWidth={1.5}
                />
              )}
              <a
                href={`/api/assets/id/${f.assetId}`}
                target="_blank"
                rel="noopener"
                className="min-w-0 flex-1 truncate text-link"
              >
                {t("receiptN", { n: i + 1 })}
              </a>
              <span className="text-ink-subtle">{formatKilobytes(f.byteSize, locale)}</span>
              <Button
                type="button"
                variant="link"
                size="sm"
                aria-label={t("removeReceipt", { n: i + 1 })}
                onClick={() => setFiles((list) => list.filter((x) => x.assetId !== f.assetId))}
              >
                <X className="size-3" strokeWidth={1.5} /> {tc("remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
