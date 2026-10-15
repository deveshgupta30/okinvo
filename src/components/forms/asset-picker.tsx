"use client";

import { FileText, ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  AttachmentsUpload,
  DOCUMENT_TYPES,
  IMAGE_TYPES,
} from "@/components/documents/attachments-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Kind = "LOGO" | "SIGNATURE" | "STAMP" | "RECEIPT" | "LETTERHEAD";

/** Uploads through /api/uploads and keeps the asset id in a hidden field named `name`. */
export function AssetPicker({
  name,
  kind,
  label,
  assetId,
  assetKey,
  hint,
  onChange,
}: {
  name: string;
  kind: Kind;
  label: string;
  assetId?: string | null | undefined;
  assetKey?: string | null | undefined;
  hint?: string;
  /** Called with the new asset id after an upload, or null on Remove (controlled consumers). */
  onChange?: ((assetId: string | null) => void) | undefined;
}) {
  const t = useTranslations("assets");
  const tc = useTranslations("common");
  const [id, setId] = useState(assetId ?? "");
  const [key, setKey] = useState(assetKey ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body });
      const json = (await res.json()) as { assetId?: string; storageKey?: string; error?: string };
      if (!res.ok || !json.assetId || !json.storageKey) {
        setError(
          json.error === "TOO_LARGE"
            ? t("tooLarge")
            : json.error === "UNSUPPORTED_TYPE"
              ? kind === "RECEIPT"
                ? t("unsupportedReceipt")
                : t("unsupportedImage")
              : t("uploadFailed"),
        );
        return;
      }
      setId(json.assetId);
      setKey(json.storageKey);
      onChange?.(json.assetId);
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={id} />
      <div className="flex items-center gap-3">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border border-hairline bg-surface-2">
          {key && key.endsWith(".pdf") ? (
            <FileText aria-hidden className="size-6 text-ink-subtle" strokeWidth={1.5} />
          ) : key || id ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, session-gated asset route
            <img
              src={key ? `/api/assets/${key}` : `/api/assets/id/${id}`}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImagePlus aria-hidden className="size-5 text-ink-tertiary" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <AttachmentsUpload
            dataKind={kind}
            label={label}
            accept={kind === "RECEIPT" ? DOCUMENT_TYPES : IMAGE_TYPES}
            busy={busy}
            onFilesAdded={(files) => {
              const f = files[0];
              if (f) void upload(f);
            }}
            onRejected={() =>
              setError(kind === "RECEIPT" ? t("unsupportedReceipt") : t("unsupportedImage"))
            }
          />
          <div className="flex items-center gap-2">
            {hint ? <span className="text-app-caption text-ink-subtle">{hint}</span> : null}
            {id ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  setId("");
                  setKey("");
                  onChange?.(null);
                }}
              >
                <X className="size-3" strokeWidth={1.5} /> {tc("remove")}
              </Button>
            ) : null}
          </div>
          {error ? (
            <span role="alert" className="text-app-caption text-semantic-danger">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
