// @ts-nocheck -- vendored from beui.dev (pnpm vendor:update beui); checked by its own build, not this project's strict settings
import type { ReactNode } from "react";

/** Calendar dates, independent of a browser's timezone: YYYY-MM-DD. */
export interface DateRange {
  from: string;
  to?: string;
}
export interface DateRangePreset {
  label: string;
  value: DateRange;
}
export interface DateRangePickerProps {
  /** okinvo: accessible names of the month and year choosers (translated by the caller). */
  labels?: { month?: string; year?: string };
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onValueChange?: (range: DateRange | null) => void;
  defaultMonth?: string;
  min?: string;
  max?: string;
  isDateDisabled?: (date: string) => boolean;
  presets?: DateRangePreset[];
  locale?: string;
  label?: string;
  disabled?: boolean;
  /** Move focus to the active date on mount, for use inside a popover. */
  autoFocus?: boolean;
  /** Show the start/end summary above the calendar. Default true. */
  showSummary?: boolean;
  className?: string;
  /** Compose custom controls; omitted children render the inline calendar. */
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Close an open popover after a complete range or preset. Default false. */
  closeOnSelect?: boolean;
}
