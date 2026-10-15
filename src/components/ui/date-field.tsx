"use client";

import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import {
  DateRangePicker,
  DateRangePickerCalendar,
  DateRangePickerContent,
  DateRangePickerTrigger,
} from "@/components/motion/date-range-picker";
import type { DateRange } from "@/components/motion/date-range-picker/types";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar date (`YYYY-MM-DD` at every boundary, SPEC §4): the native date input keeps its id,
 * name, keyboard entry and the value the form posts, and the calendar button beside it opens
 * beui's picker in single-date mode (addendum §3), which writes back through the same input
 * so consumers keep the native `onChange(event)` contract.
 */
export function DateField({
  value,
  defaultValue,
  onChange,
  className,
  min,
  max,
  ...props
}: InputProps) {
  const t = useTranslations("ui");
  const locale = useLocale();
  const ref = React.useRef<HTMLInputElement | null>(null);
  const [own, setOwn] = React.useState(() => String(value ?? defaultValue ?? ""));
  const [open, setOpen] = React.useState(false);
  const current = value !== undefined ? String(value ?? "") : own;
  const range: DateRange | null = ISO_DATE.test(current) ? { from: current, to: current } : null;

  const pick = (next: DateRange | null) => {
    if (!next) return;
    const day = next.from;
    setOwn(day);
    setOpen(false);
    const el = ref.current;
    if (!el) return;
    el.value = day;
    onChange?.({ target: el, currentTarget: el } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Input
        {...props}
        ref={ref}
        type="date"
        className="font-mono"
        {...(value !== undefined ? { value } : { defaultValue: own })}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        onChange={(e) => {
          setOwn(e.target.value);
          onChange?.(e);
        }}
      />
      <DateRangePicker
        value={range}
        onValueChange={pick}
        open={open}
        onOpenChange={setOpen}
        locale={locale}
        label={t("openCalendar")}
        showSummary={false}
        {...(typeof min === "string" && ISO_DATE.test(min) ? { min } : {})}
        {...(typeof max === "string" && ISO_DATE.test(max) ? { max } : {})}
        {...(props.disabled ? { disabled: true } : {})}
      >
        <DateRangePickerTrigger
          aria-label={t("openCalendar")}
          className="size-8 shrink-0 justify-center rounded-md border-input bg-surface-1 px-0 text-ink-subtle hover:bg-surface-2 hover:text-ink"
        >
          <CalendarDays aria-hidden className="size-4" strokeWidth={1.5} />
        </DateRangePickerTrigger>
        <DateRangePickerContent className="border-hairline bg-surface-1">
          <DateRangePickerCalendar showSummary={false} />
        </DateRangePickerContent>
      </DateRangePicker>
    </div>
  );
}
