"use client";

import { RangeSlider } from "@/components/motion/range-slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A bounded number (header image opacity, logo and header height): beui's range slider for
 * the hand, and a small number input carrying the field's id for the keyboard, labels and
 * tests (addendum §3). Both drive the same value.
 */
export function SliderField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  className,
}: {
  id: string;
  /** The field's label text, announced for the slider. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Spoken value with its unit ("50%", "16 mm"). */
  format?: (value: number) => string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <RangeSlider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onChange}
        aria-label={label}
        showTicks={false}
        className="min-w-0 flex-1"
        {...(format ? { formatValueText: format } : {})}
      />
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
        }}
        className="w-20 font-mono"
      />
    </div>
  );
}
