// @ts-nocheck -- vendored from beui.dev (pnpm vendor:update beui); checked by its own build, not this project's strict settings
"use client";

import { createContext, useContext } from "react";
import type { useDateRangePickerController } from "./use-date-range-picker";

type DateRangePickerContextValue = ReturnType<
  typeof useDateRangePickerController
>;
export const DateRangePickerContext =
  createContext<DateRangePickerContextValue | null>(null);
export function useDateRangePickerContext(part: string) {
  const context = useContext(DateRangePickerContext);
  if (!context) throw new Error(`${part} must be used within DateRangePicker`);
  return context;
}
