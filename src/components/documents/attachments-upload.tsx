"use client";

import { Upload } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Loader } from "@/components/motion/loader";
import { cn } from "@/lib/utils";

/** What every upload in the app accepts (v2 §11.2): images, and PDFs where `pdf` is allowed. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"] as const;

/** True when the file's declared type is one of `accept` (the server checks the bytes again). */
export function isAccepted(file: Pick<File, "type">, accept: readonly string[]): boolean {
  return accept.includes(file.type);
}

/**
 * A drop zone in the style of beui's attachment upload (addendum §3): drag a file in or click
 * to choose one, a springy highlight while a file hovers, the comet loader while it uploads.
 * The native file input stays inside (it carries `data-kind`, the accept list and the keyboard
 * path); files of other types go to `onRejected` instead of `onFilesAdded`. Every string is
 * translated, which is why this is okinvo's own component rather than the vendored block.
 */
export function AttachmentsUpload({
  accept,
  onFilesAdded,
  onRejected,
  busy = false,
  disabled = false,
  multiple = false,
  dataKind,
  label,
  className,
}: {
  accept: readonly string[];
  onFilesAdded: (files: File[]) => void;
  onRejected?: (files: File[]) => void;
  busy?: boolean;
  disabled?: boolean;
  /** Take every dropped or chosen file instead of the first one (receipts on a payment). */
  multiple?: boolean;
  /** Carried on the input for tests and styling (`data-kind`). */
  dataKind?: string;
  /** Accessible name of the input, usually the field label. */
  label: string;
  className?: string;
}) {
  const t = useTranslations("assets");
  const reduce = useReducedMotion();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const inactive = disabled || busy;

  const take = (list: FileList | null) => {
    const files = multiple ? Array.from(list ?? []) : Array.from(list ?? []).slice(0, 1);
    if (files.length === 0) return;
    const ok = files.filter((f) => isAccepted(f, accept));
    const bad = files.filter((f) => !isAccepted(f, accept));
    if (bad.length > 0) onRejected?.(bad);
    if (ok.length > 0) onFilesAdded(ok);
  };

  return (
    <motion.label
      data-dropzone
      {...(over ? { "data-over": true } : {})}
      {...(reduce ? {} : { animate: { scale: over ? 1.015 : 1 } })}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onDragOver={(e) => {
        if (inactive) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!inactive) take(e.dataTransfer.files);
      }}
      className={cn(
        "flex min-h-16 cursor-pointer items-center gap-3 rounded-md border border-dashed border-hairline-strong bg-surface-1 px-3 py-2 text-app-caption text-ink-subtle transition-colors duration-150 focus-within:ring-2 focus-within:ring-ring/50 hover:bg-surface-2",
        over && "border-primary bg-surface-2 text-ink",
        inactive && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink">
        {busy ? (
          <Loader variant="comet" size={14} label="" />
        ) : (
          <Upload aria-hidden className="size-4" strokeWidth={1.5} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        {busy
          ? t("uploading")
          : over
            ? t("dropActive")
            : multiple
              ? t("dropHintMany")
              : t("dropHint")}
      </span>
      <input
        ref={inputRef}
        type="file"
        aria-label={label}
        {...(dataKind ? { "data-kind": dataKind } : {})}
        accept={accept.join(",")}
        multiple={multiple}
        disabled={inactive}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </motion.label>
  );
}
