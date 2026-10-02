"use client";

import { Camera, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeAvatarAction, setAvatarAction } from "@/server/actions/account";

const OUTPUT = 512;

/** Draws the chosen square of the source image onto a 512×512 canvas and returns it as PNG. */
async function cropToPng(src: string, area: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT, OUTPUT);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png"),
  );
}

/**
 * Profile photo: pick a file, pan and zoom it inside a circular mask, save. The crop is drawn in
 * the browser, uploaded as an AVATAR asset and linked through the audited DAL (spec §3.5).
 */
export function AvatarEditor({
  name,
  email,
  avatarKey,
}: {
  name: string;
  email: string;
  avatarKey: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (source && URL.revokeObjectURL(source)), [source]);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setSource(URL.createObjectURL(file));
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  async function save() {
    if (!source || !area) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await cropToPng(source, area);
      const body = new FormData();
      body.append("file", new File([blob], "avatar.png", { type: "image/png" }));
      body.append("kind", "AVATAR");
      const res = await fetch("/api/uploads", { method: "POST", body });
      const json = (await res.json()) as { assetId?: string; error?: string };
      if (!res.ok || !json.assetId) {
        setError(json.error === "TOO_LARGE" ? "That photo is too large." : "Upload failed.");
        return;
      }
      await setAvatarAction(json.assetId);
      setSource(null);
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} email={email} src={avatarKey} size="xl" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Camera className="size-4" strokeWidth={1.5} />
            {avatarKey ? "Change photo" : "Add photo"}
          </Button>
          {avatarKey ? (
            <Button
              type="button"
              variant="tertiary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await removeAvatarAction();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 className="size-4" strokeWidth={1.5} />
              Remove
            </Button>
          ) : null}
        </div>
        <span className="text-app-caption text-ink-subtle">
          PNG, JPEG or WebP. Shown as a circle everywhere; you can zoom and move it before saving.
        </span>
        {error ? (
          <span role="alert" className="text-app-caption text-semantic-danger">
            {error}
          </span>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Choose a profile photo"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>

      <Dialog open={source !== null} onOpenChange={(open) => !open && !busy && setSource(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Position your photo</DialogTitle>
          <DialogDescription>
            Drag to move, scroll or pinch to zoom. The circle is what everyone sees.
          </DialogDescription>
          <div className="relative h-72 w-full overflow-hidden rounded-md bg-surface-3">
            {source ? (
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : null}
          </div>
          <label className="flex items-center gap-3 text-app-caption text-ink-subtle">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setSource(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={busy || !area} onClick={() => void save()}>
              {busy ? "Saving…" : "Save photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
