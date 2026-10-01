"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Kind = "LOGO" | "SIGNATURE" | "STAMP";

/** Uploads through /api/uploads and keeps the asset id in a hidden field named `name`. */
export function AssetPicker({
  name,
  kind,
  label,
  assetId,
  assetKey,
  hint,
}: {
  name: string;
  kind: Kind;
  label: string;
  assetId?: string | null | undefined;
  assetKey?: string | null | undefined;
  hint?: string;
}) {
  const [id, setId] = useState(assetId ?? "");
  const [key, setKey] = useState(assetKey ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
            ? "That file is too large."
            : json.error === "UNSUPPORTED_TYPE"
              ? "Use a PNG, JPEG or WebP image."
              : "Upload failed.",
        );
        return;
      }
      setId(json.assetId);
      setKey(json.storageKey);
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={id} />
      <div className="flex items-center gap-3">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border border-hairline bg-surface-2">
          {key ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, session-gated asset route
            <img
              src={`/api/assets/${key}`}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImagePlus aria-hidden className="size-5 text-ink-tertiary" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-app-caption text-ink-subtle file:mr-2 file:h-7 file:rounded-md file:border file:border-hairline file:bg-surface-1 file:px-3 file:text-app-caption file:text-ink"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
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
                }}
              >
                <X className="size-3" strokeWidth={1.5} /> Remove
              </Button>
            ) : null}
          </div>
          {busy ? <span className="text-app-caption text-ink-subtle">Uploading…</span> : null}
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
