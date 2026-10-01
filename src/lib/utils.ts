import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { TYPOGRAPHY_KEYS } from "@/lib/typography-keys.generated";

/**
 * tailwind-merge only knows Tailwind's default font sizes; without this it files `text-app-label`
 * under text colours and drops it when a colour class follows (or vice versa).
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...TYPOGRAPHY_KEYS] }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
