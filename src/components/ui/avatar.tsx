import { initialsOf } from "@/lib/initials";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-app-caption",
  md: "size-10 text-app-label",
  lg: "size-16 text-app-section",
  xl: "size-24 text-display-md",
} as const;

/**
 * The person's photo as a 1:1 circle, or their initials on the accent colour when there is
 * no photo (spec §3.5). `src` is an asset storage key, served through the session-gated route.
 */
export function Avatar({
  name,
  email,
  src,
  size = "md",
  className,
}: {
  name: string;
  email: string;
  src?: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const label = name.trim() || email;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private, session-gated asset route
      <img
        src={`/api/assets/${src}`}
        alt={label}
        className={cn("shrink-0 rounded-full object-cover", SIZES[size], className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-on-primary select-none",
        SIZES[size],
        className,
      )}
    >
      {initialsOf(name, email)}
    </span>
  );
}
