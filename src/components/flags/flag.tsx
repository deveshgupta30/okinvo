import { countryName } from "@/lib/geo/countries";
import { cn } from "@/lib/utils";

/** The countries with a bundled flag image under public/flags (spec §4.3: US, UK, India). */
export const FLAG_CODES = ["US", "GB", "IN"] as const;
export type FlagCode = (typeof FLAG_CODES)[number];

/** Fixed image paths, so the src never carries caller text. */
const FLAG_SRC: Record<FlagCode, string> = {
  US: "/flags/us.svg",
  GB: "/flags/gb.svg",
  IN: "/flags/in.svg",
};

export function hasFlag(code: string): code is FlagCode {
  return (FLAG_CODES as readonly string[]).includes(code.toUpperCase());
}

/** A small flag as an image (never an emoji: those render as letters on Windows). */
export function Flag({ code, className }: { code: string; className?: string }) {
  if (!hasFlag(code)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static public asset, no optimisation needed
    <img
      src={FLAG_SRC[code.toUpperCase() as FlagCode]}
      alt={countryName(code)}
      width={24}
      height={16}
      className={cn("inline-block h-4 w-6 rounded-[2px] border border-hairline", className)}
    />
  );
}
