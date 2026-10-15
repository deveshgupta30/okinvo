"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { DigitSwap } from "@/components/motion/digit-swap";
import { Input, type InputProps } from "@/components/ui/input";
import { maskValue } from "@/lib/mask";
import { cn } from "@/lib/utils";

/**
 * A text input for a sensitive identifier (PAN, GSTIN, VAT number, bank account, IFSC, UPI id):
 * an existing value shows as bullets with its last characters until "Reveal" shows it or "Edit"
 * opens the input (addendum §3, beui digit-swap). The native input keeps its id, name and value
 * the whole time, so the form posts it and labels reach it; an empty field starts in edit mode.
 */
export function MaskedField({
  keep = 4,
  value,
  defaultValue,
  onChange,
  className,
  ...props
}: InputProps & { keep?: number }) {
  const t = useTranslations("ui");
  const tc = useTranslations("common");
  const ref = React.useRef<HTMLInputElement | null>(null);
  const initial = String(value ?? defaultValue ?? "");
  const [current, setCurrent] = React.useState(initial);
  const [editing, setEditing] = React.useState(initial.trim() === "");
  const [revealed, setRevealed] = React.useState(false);
  const shown = value !== undefined ? String(value ?? "") : current;

  const edit = () => {
    setEditing(true);
    requestAnimationFrame(() => ref.current?.focus());
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div className={editing ? undefined : "hidden"}>
        <Input
          {...props}
          ref={ref}
          {...(value !== undefined ? { value } : { defaultValue: initial })}
          onChange={(e) => {
            setCurrent(e.target.value);
            onChange?.(e);
          }}
        />
      </div>
      {editing ? null : (
        <div className="flex h-8 items-center gap-3">
          <DigitSwap
            value={revealed ? shown.trim() : maskValue(shown, keep)}
            className="app-mono text-app-body text-ink"
          />
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="text-app-caption text-link underline-offset-4 hover:underline"
          >
            {revealed ? t("hide") : t("reveal")}
          </button>
          <button
            type="button"
            onClick={edit}
            className="text-app-caption text-link underline-offset-4 hover:underline"
          >
            {tc("edit")}
          </button>
        </div>
      )}
    </div>
  );
}
